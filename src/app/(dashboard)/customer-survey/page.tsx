import { auth } from '@/lib/auth'
import SurveyClient from './SurveyClient'

export default async function CustomerSurveyPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role ?? ''
  return <SurveyClient role={role} />
}
