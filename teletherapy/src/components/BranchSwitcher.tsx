'use client'

import { useSession } from 'next-auth/react'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { MapPin } from 'lucide-react'

interface BranchInfo {
  staffId: string
  branch: string
  department: string
}

const BRANCH_LABELS: Record<string, string> = {
  SANDBOX_EAST: 'East',
  SANDBOX_GREENHILLS: 'Greenhills',
  VERDANA_STORE: 'Verdana',
  SBEA: 'East',
  SBGH: 'Greenhills',
}

function branchLabel(branch: string) {
  return BRANCH_LABELS[branch] ?? branch
}

interface BranchSwitcherState {
  branches: BranchInfo[]
  isMultiBranch: boolean
  activeStaffId: string
  activeBranch?: BranchInfo
  switchBranch: (staffId: string) => void
}

const BranchContext = createContext<BranchSwitcherState | null>(null)

const STORAGE_KEY = 'teletherapy_active_staffId'

/**
 * Holds the active-branch selection ONCE for the whole dashboard so a single
 * toggle in the top bar drives every page's filtering live. Any staff member
 * whose email maps to >1 Staff record (e.g. someone working at both East and
 * Greenhills) gets `branches.length > 1` and sees the toggle — clinicians and
 * non-clinicians (front desk, admin staff) alike. No second login needed.
 */
export function BranchProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const branches = (session?.user?.branches ?? []) as BranchInfo[]
  const isMultiBranch = branches.length > 1

  const [activeStaffId, setActiveStaffId] = useState<string>('')

  useEffect(() => {
    if (!session?.user) return

    if (isMultiBranch) {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && branches.some((b) => b.staffId === saved)) {
        setActiveStaffId(saved)
      } else {
        setActiveStaffId(branches[0].staffId)
      }
    } else {
      setActiveStaffId(session.user.staffId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.staffId, isMultiBranch, branches.length])

  function switchBranch(staffId: string) {
    setActiveStaffId(staffId)
    localStorage.setItem(STORAGE_KEY, staffId)
  }

  const activeBranch = branches.find((b) => b.staffId === activeStaffId)

  return (
    <BranchContext.Provider
      value={{ branches, isMultiBranch, activeStaffId, activeBranch, switchBranch }}
    >
      {children}
    </BranchContext.Provider>
  )
}

/**
 * Read the shared branch-switcher state. Falls back to inert defaults if used
 * outside <BranchProvider> so a stray call can never crash a page.
 */
export function useBranchSwitcher(): BranchSwitcherState {
  const ctx = useContext(BranchContext)
  if (!ctx) {
    return {
      branches: [],
      isMultiBranch: false,
      activeStaffId: '',
      activeBranch: undefined,
      switchBranch: () => {},
    }
  }
  return ctx
}

/** Top-bar toggle. Renders nothing for single-branch staff. */
export default function BranchSwitcher() {
  const { branches, activeStaffId, switchBranch } = useBranchSwitcher()

  if (branches.length <= 1) return null

  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--pale-teal)] border border-[var(--light-gray)]">
      {branches.map((b) => {
        const active = b.staffId === activeStaffId
        return (
          <button
            key={b.staffId}
            onClick={() => switchBranch(b.staffId)}
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
