import InquiryClient from './InquiryClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Ask a Question — Aura Health Rehab',
  description: 'Send an enquiry to Aura Health Rehab East or Greenhills and get a reference number you can follow up with.',
}

export default function InquiryPage() {
  return <InquiryClient />
}
