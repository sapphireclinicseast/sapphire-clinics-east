'use client'

import { useParams } from 'next/navigation'
import PsychTestsEditor from '../PsychTestsEditor'

/** Direct tokened entry to the Psych Tests editor — the original share links keep working. */
export default function PsychTestsTokenPage() {
  const { token } = useParams<{ token: string }>()
  return <PsychTestsEditor token={token} />
}
