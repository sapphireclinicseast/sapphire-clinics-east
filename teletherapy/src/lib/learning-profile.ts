// Shared shape + option lists for the intern Learning Outcomes & Preferences form.

export const LEARN_BEST_OPTIONS = [
  'Visual — videos, demonstrations, diagrams',
  'Auditory — lectures, discussions',
  'Reading and writing — notes, articles',
  'Hands-on — return demonstration, patient handling',
]

export const FEEDBACK_OPTIONS = [
  'Immediate, during or right after the session',
  'Written, so I can review it later',
  'End-of-day debrief',
]

export const PREP_OPTIONS = [
  'Read patient charts',
  'Review techniques ahead',
  'Ask questions during case briefing',
  'Go with the flow',
]

export interface LearningProfileData {
  outcomes: { expectations: string; lookingForward: string; improve: string }
  learnBest: string[]
  learnBestOther: string
  feedback: string[]
  feedbackOther: string
  prep: string[]
  challenges: string
}

export const EMPTY_LEARNING_PROFILE: LearningProfileData = {
  outcomes: { expectations: '', lookingForward: '', improve: '' },
  learnBest: [],
  learnBestOther: '',
  feedback: [],
  feedbackOther: '',
  prep: [],
  challenges: '',
}
