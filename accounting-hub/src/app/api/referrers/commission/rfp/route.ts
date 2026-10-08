import { NextResponse } from 'next/server'

// TOMBSTONE — the external-doctor RFP payout was rolled back on Hannah's call
// (2026-10-08): external doctors' commissions are NOT paid through RFPs. This
// file exists (rather than being deleted) because the CI deploy rsyncs WITHOUT
// --delete, so a deleted route lives on in /opt/accounting and keeps compiling
// into the served bundle; an overwrite is the only change that propagates.
// If the payout is ever wanted again, the working implementation is one git
// revert away (commit feb15bac removed it; 55bf91f1 built it).
export async function POST() {
  return NextResponse.json({ error: 'The external-doctor RFP payout has been disabled — commissions for external doctors are tracked on the Commission tab but not paid through RFPs.' }, { status: 410 })
}
