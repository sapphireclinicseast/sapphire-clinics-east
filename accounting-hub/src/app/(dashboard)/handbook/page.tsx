'use client'

import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { HandbookBody } from './HandbookView'

export default function HandbookPage() {
  const { status } = useSession()
  if (status === 'unauthenticated') redirect('/login')
  return <HandbookBody />
}
