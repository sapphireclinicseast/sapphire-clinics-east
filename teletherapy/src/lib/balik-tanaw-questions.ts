// Balik-Tanaw weekly-reflection questions per department. SPED is provided;
// other departments will be added later (empty = not configured yet).
export const BALIK_TANAW_QUESTIONS: Record<string, string[]> = {
  SPED: [
    'Describe an encounter during class that made an impact on you. Describe how the experience affected your thoughts, feelings, and perceptions.',
    'How would you assess your teaching performance in the past week?',
    'What do you want to improve on in the following week, with respect to: (a) learner care; (b) classroom preparation; (c) interpersonal skills — with learners, your CT, or caregivers?',
  ],
}

export function questionsForDepartment(dept?: string | null): string[] {
  return BALIK_TANAW_QUESTIONS[(dept ?? '').toUpperCase()] ?? []
}
