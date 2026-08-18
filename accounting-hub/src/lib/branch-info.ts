/**
 * Shared branch display info (name/address/phone/TIN) for payslips and
 * payroll UI. Used to be copy-pasted separately into EmployeePayroll.tsx,
 * payroll/page.tsx, and payslip-pdf-consultant.ts — already drifted (one
 * copy keyed Verdana as `VERDANA`, the other two as `VERDANA_STORE`; one
 * copy's default-branch phone was blank where the other two weren't).
 * This is the one copy now; all three import from here.
 *
 * NOT live-synced from HR Platform's Branches Registry (see HR Platform's
 * `modules/branches`) — payslip-pdf-consultant.ts is isomorphic (runs in
 * the browser AND on the server, see its own header comment), so it can't
 * do a live Prisma read the way a server-only route can. If HR Platform's
 * registry data changes, update this file to match. A future enhancement
 * could have the server-side call sites (the /api/internal/my-payslips/pdf
 * route) prefer a live HrBranch lookup and fall back to this file, while
 * the client-side call sites keep using this static copy.
 */

export interface BranchInfo {
  name: string
  address: string
  phone: string
  tin: string
}

const VERDANA_INFO: BranchInfo = {
  name: 'Verdana Store',
  address: 'Metro Manila, Philippines',
  phone: '',
  tin: '',
}

export const BRANCH_INFO: Record<string, BranchInfo> = {
  SBEA: {
    name: 'Sapphire Clinics East Inc. – East Branch',
    address: '4th Floor Robinsons Metro East, Marcos Highway, Dela Paz, Pasig City',
    phone: '0917 118 9289 | (02) 5310-4991',
    tin: 'TIN 010-817-642-00000',
  },
  SBGH: {
    name: 'Sapphire Clinics East Inc. – Greenhills Branch',
    address: 'Level 8, GH Tower Offices, South Drive, Ortigas Avenue, Greenhills, San Juan City',
    phone: '0917 770 1686 | (02) 8529 1590',
    tin: 'TIN 010-817-642-00001',
  },
  // Both keys map to the same object — different call sites used different
  // Verdana keys before this consolidation; rather than guess which one is
  // "right" and risk a silent lookup miss, both resolve.
  VERDANA: VERDANA_INFO,
  VERDANA_STORE: VERDANA_INFO,
  '': {
    name: 'Sapphire Clinics East Inc.',
    address: 'Metro Manila, Philippines',
    phone: '0917 770 1686 | (02) 8529 1590',
    tin: '',
  },
}
