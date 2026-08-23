'use client'

import { useSession } from 'next-auth/react'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'

interface BranchInfo {
  staffId: string
  branch: string
  department: string
}

interface BranchSwitcherState {
  branches: BranchInfo[]
  isMultiBranch: boolean
  /** All branches share one Staff row (the extraBranches model). When true,
   *  filtering can't be done by staffId — consumers pass the active branch
   *  code so the API scopes by the patient's branch instead. */
  sharedStaffId: boolean
  activeBranchCode: string
  activeStaffId: string
  activeBranch?: BranchInfo
  switchBranch: (branchCode: string) => void
}

const BranchContext = createContext<BranchSwitcherState | null>(null)

const STORAGE_KEY = 'teletherapy_active_branch'

/**
 * Holds the active-branch selection ONCE for the whole dashboard so a single
 * toggle in the top bar drives every page's filtering live. A staff member
 * who works at >1 branch — whether as a merged Staff row with extraBranches[]
 * or (legacy) as one Staff row per branch — gets `branches.length > 1` and
 * sees the toggle. Clinicians and non-clinicians alike; no second login.
 *
 * The active selection is keyed on the BRANCH CODE, not the staffId: merged
 * interbranch consultants share one staffId across branches, so keying on
 * staffId could never tell their branches apart.
 */
export function BranchProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const branches = (session?.user?.branches ?? []) as BranchInfo[]
  const isMultiBranch = branches.length > 1
  const sharedStaffId =
    isMultiBranch && new Set(branches.map((b) => b.staffId)).size === 1

  const [activeBranchCode, setActiveBranchCode] = useState<string>('')

  useEffect(() => {
    if (!session?.user) return

    if (isMultiBranch) {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && branches.some((b) => b.branch === saved)) {
        setActiveBranchCode(saved)
      } else {
        setActiveBranchCode(branches[0].branch)
      }
    } else {
      setActiveBranchCode(branches[0]?.branch ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.staffId, isMultiBranch, branches.length])

  function switchBranch(branchCode: string) {
    setActiveBranchCode(branchCode)
    localStorage.setItem(STORAGE_KEY, branchCode)
  }

  const activeBranch = branches.find((b) => b.branch === activeBranchCode)
  // For legacy (per-branch staffId) consultants this is the branch's own
  // staffId; for merged (extraBranches) consultants it's the shared id and
  // branch scoping happens via the patient-branch filter instead.
  const activeStaffId = activeBranch?.staffId ?? session?.user?.staffId ?? ''

  return (
    <BranchContext.Provider
      value={{ branches, isMultiBranch, sharedStaffId, activeBranchCode, activeStaffId, activeBranch, switchBranch }}
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
      sharedStaffId: false,
      activeBranchCode: '',
      activeStaffId: '',
      activeBranch: undefined,
      switchBranch: () => {},
    }
  }
  return ctx
}

/** Top-bar toggle. Renders nothing for single-branch staff. */
export default function BranchSwitcher() {
  const { branches, activeBranchCode, switchBranch } = useBranchSwitcher()

  if (branches.length <= 1) return null

  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--pale-teal)] border border-[var(--light-gray)]">
      {branches.map((b) => {
        const active = b.branch === activeBranchCode
        return (
          <button
            key={b.branch}
            onClick={() => switchBranch(b.branch)}
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
