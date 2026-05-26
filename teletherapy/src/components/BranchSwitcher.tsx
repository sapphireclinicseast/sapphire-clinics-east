'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'

interface BranchInfo {
  staffId: string
  branch: string
  department: string
}

const BRANCH_LABELS: Record<string, string> = {
  SANDBOX_EAST: 'Sandbox East',
  SANDBOX_GREENHILLS: 'Sandbox Greenhills',
  VERDANA_STORE: 'Verdana Store',
  SBEA: 'Sandbox East',
  SBGH: 'Sandbox Greenhills',
}

function branchLabel(branch: string) {
  return BRANCH_LABELS[branch] ?? branch
}

export function useBranchSwitcher() {
  const { data: session } = useSession()
  const branches = (session?.user?.branches ?? []) as BranchInfo[]
  const isMultiBranch = branches.length > 1

  const [activeStaffId, setActiveStaffId] = useState<string>('')

  useEffect(() => {
    if (!session?.user) return

    if (isMultiBranch) {
      // Restore from localStorage or default to first
      const saved = localStorage.getItem('teletherapy_active_staffId')
      if (saved && branches.some((b) => b.staffId === saved)) {
        setActiveStaffId(saved)
      } else {
        setActiveStaffId(branches[0].staffId)
      }
    } else {
      setActiveStaffId(session.user.staffId)
    }
  }, [session?.user?.staffId, isMultiBranch, branches.length])

  function switchBranch(staffId: string) {
    setActiveStaffId(staffId)
    localStorage.setItem('teletherapy_active_staffId', staffId)
  }

  const activeBranch = branches.find((b) => b.staffId === activeStaffId)

  return {
    branches,
    isMultiBranch,
    activeStaffId,
    activeBranch,
    switchBranch,
  }
}

export default function BranchSwitcher({
  branches,
  activeStaffId,
  onSwitch,
}: {
  branches: BranchInfo[]
  activeStaffId: string
  onSwitch: (staffId: string) => void
}) {
  if (branches.length <= 1) return null

  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--pale-teal)] border border-[var(--light-gray)]">
      {branches.map((b) => {
        const active = b.staffId === activeStaffId
        return (
          <button
            key={b.staffId}
            onClick={() => onSwitch(b.staffId)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all duration-200 ${
              active
                ? 'bg-white text-[var(--deep-teal)] shadow-sm border border-[var(--light-gray)]'
                : 'text-[var(--mid-gray)] hover:text-[var(--charcoal)] hover:bg-white/50'
            }`}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <MapPin size={13} className={active ? 'text-[#C68077]' : ''} />
            {branchLabel(b.branch)}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-[var(--pale-teal)] text-[var(--teal)]' : 'bg-gray-100 text-gray-400'}`}>
              {b.department}
            </span>
          </button>
        )
      })}
    </div>
  )
}
