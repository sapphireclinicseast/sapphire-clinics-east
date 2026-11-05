'use client'

// "MD by Subspecialty → Therapy Services" — the MD row of the Pairwise Affinity
// Matrix above pools three practices (Developmental Paediatrics, Rehabilitation
// Medicine, Psychiatry) that refer into quite different therapy lines, so read
// as one row it describes a pattern none of them has. This panel scores each
// separately, against every therapy service, with the clinically expected
// pairing marked so a pairing that does NOT hold is as visible as one that does.

import type { AffinityEntry, MdSubRow, MdSubCoverage } from './affinity'
import { rrPhrase } from './affinity'

const THERAPY_DEPTS = ['OT', 'PT', 'SLP', 'SPED', 'PSYCHOLOGY'] as const
const DEPT_COLORS: Record<string, string> = {
  OT: '#1A7B8A', PT: '#2AAABB', SLP: '#F59E0B', SPED: '#8B5CF6', PSYCHOLOGY: '#7C3AED',
}

/**
 * Which way a pairing points, read off the age-adjusted risk ratio.
 *
 * Deliberately NOT read off lift. Lift is unadjusted, and in this panel the two
 * genuinely disagree: every Developmental Paediatrics patient is a child, and
 * children use OT heavily, so lift puts DevPed → OT above chance while the
 * within-age comparison shows DevPed patients are *less* likely to use OT than
 * other children. Treating a significant downward pairing as "no signal" would
 * throw away the more interesting half of that finding.
 */
// A direction also has to survive its own confidence interval. The q-value is
// computed on the unadjusted 2×2, so a pair can clear FDR correction while the
// age-adjusted interval still spans 1 — DevPed → SLP does exactly that
// (q < 0.001, RR 1.13, CI 0.83–1.55). Calling that an upward pairing would
// publish a direction the data has not settled.
type Dir = 'up' | 'down' | 'flat'
function rrDir(a: AffinityEntry): Dir {
  if (!a.pSig || a.riskRatio == null) return 'flat'
  if (a.riskRatio > 1) return (a.riskCiLow == null || a.riskCiLow > 1) ? 'up' : 'flat'
  if (a.riskRatio < 1) return (a.riskCiHigh == null || a.riskCiHigh < 1) ? 'down' : 'flat'
  return 'flat'
}

// Colour by adjusted direction and strength, and plain grey whenever the pair
// isn't significant — a colour on noise reads as a finding.
function dirBg(a: AffinityEntry): string {
  const rr = a.riskRatio
  if (rr == null || rrDir(a) === 'flat') return '#f9fafb'
  if (rrDir(a) === 'down') return '#fef3c7'
  if (rr >= 2.0) return '#dcfce7'
  if (rr >= 1.2) return '#d1fae5'
  return '#e0f2fe'
}
function dirFg(a: AffinityEntry): string {
  const rr = a.riskRatio
  if (rr == null || rrDir(a) === 'flat') return '#6b7280'
  if (rrDir(a) === 'down') return '#d97706'
  if (rr >= 2.0) return '#15803d'
  if (rr >= 1.2) return '#059669'
  return '#0284c7'
}
function dirLabel(a: AffinityEntry): string {
  if (a.riskRatio == null) return 'no estimate'
  const dir = rrDir(a)
  // Not significant at all, versus significant with an interval that still
  // spans 1 — the second is a measured pair whose direction is undecided, and
  // saying so is more useful than calling it nothing.
  if (dir === 'flat') return a.pSig ? '→ direction not settled' : '→ not significant'
  const rr = a.riskRatio
  if (dir === 'down') return rr === 0 ? '↓ never together' : '↓ Less likely'
  if (rr >= 2.0) return '↑↑ Strong'
  if (rr >= 1.2) return '↑ Moderate'
  return '↗ Slight'
}

/**
 * Reads one subspecialty row against the referral pattern it is expected to
 * produce: which expected pairings hold, which run the other way, which show
 * nothing, and anything strong that was not expected at all. Written out in
 * full rather than reduced to a verdict because "DevPed → PT runs the other
 * way" is a finding, not a gap.
 */
export function mdSubPlainReading(row: MdSubRow): string {
  if (row.count === 0) {
    return 'No patients could be attributed to this subspecialty in the selected branches.'
  }
  const byRr = (x: AffinityEntry, y: AffinityEntry) => (y.riskRatio ?? 0) - (x.riskRatio ?? 0)
  const expected  = row.affinities.filter((a) => a.expected)
  const held      = expected.filter((a) => rrDir(a) === 'up').sort(byRr)
  const inverse   = expected.filter((a) => rrDir(a) === 'down')
  const flat      = expected.filter((a) => rrDir(a) === 'flat')
  // Within "flat", a pair that cleared FDR correction but whose adjusted
  // interval spans 1 is a different statement from one that showed nothing.
  const unsettled = flat.filter((a) => a.pSig)
  const quiet     = flat.filter((a) => !a.pSig)
  const surprise  = row.affinities
    .filter((a) => !a.expected && rrDir(a) === 'up').sort(byRr)

  const names = (xs: AffinityEntry[]) => xs.map((a) => a.target).join(', ')
  const parts: string[] = []

  if (held.length > 0) {
    const top = held[0]
    parts.push(
      `Expected referral into ${names(held)} holds — ${top.confidencePct}% of ` +
      `${row.short} patients also use ${top.target}${rrPhrase(top)}.`,
    )
  }
  if (inverse.length > 0) {
    parts.push(
      `${names(inverse)} runs the other way: once patient type is held constant these patients are ` +
      `significantly LESS likely to use ${inverse.length > 1 ? 'those services' : 'it'} than ` +
      `comparable patients, so the overlap in the raw counts is age, not referral.`,
    )
  }
  if (unsettled.length > 0) {
    const u = unsettled[0]
    parts.push(
      `${names(unsettled)} measures above the clinic-wide rate (${u.confidencePct}% of these patients) ` +
      `but the age-adjusted interval still spans 1, so the direction is not settled.`,
    )
  }
  if (quiet.length > 0) {
    const q = quiet[0]
    parts.push(
      `No reliable signal for ${names(quiet)}` +
      (quiet.length === 1 && q.confidencePct > 0
        ? ` — ${q.confidencePct}% of these patients use it, but that is close to the clinic-wide rate, so seeing this doctor does not itself predict it.`
        : '.'),
    )
  }
  if (surprise.length > 0) {
    const s = surprise[0]
    parts.push(`Not expected but present: ${s.target} (${s.confidencePct}%${rrPhrase(s)}).`)
  }
  return parts.join(' ')
}

export default function MdSubspecialtySection({
  rows, coverage, totalPatients,
}: {
  rows: MdSubRow[]
  coverage?: MdSubCoverage
  totalPatients: number
}) {
  if (rows.length === 0) return null

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--mid-gray)' }}>
        MD by Subspecialty → Therapy Services
      </p>
      <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>
        The MD row above pools three practices with different referral patterns. Here each is scored
        separately against every therapy service, with the clinically expected pairing marked —{' '}
        <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>DevPed → OT, PT, SLP, SPED</span> ·{' '}
        <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>Rehab Med → PT</span> ·{' '}
        <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>Psychiatry → Psychology</span> —
        so a pairing that does not hold is as visible as one that does. Same statistics and the same{' '}
        {totalPatients.toLocaleString()}-patient denominator as the matrix above; q-values are corrected
        across these 15 cells as their own family. Cells are coloured by the{' '}
        <strong>age-adjusted risk ratio</strong>, not by lift: every DevPed patient is a child and
        children use OT heavily, so the two point opposite ways here, and the adjusted figure is the one
        that answers &ldquo;did this doctor&rsquo;s patients go on to therapy more than comparable
        patients?&rdquo;
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        {[
          { label: '↑↑ Strong — over 2× as likely as comparable patients', bg: '#dcfce7', fg: '#15803d' },
          { label: '↑ Moderate — 1.2–2× as likely',                        bg: '#d1fae5', fg: '#059669' },
          { label: '↗ Slight — just above 1×',                             bg: '#e0f2fe', fg: '#0284c7' },
          { label: '↓ Less likely — significant, but the other way',       bg: '#fef3c7', fg: '#d97706' },
          { label: '→ Direction not settled, or not significant',          bg: '#f9fafb', fg: '#6b7280' },
        ].map((leg) => (
          <span key={leg.label} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: leg.bg, color: leg.fg, border: '1px solid rgba(0,0,0,0.06)' }}>
            {leg.label}
          </span>
        ))}
      </div>

      {coverage && coverage.unattributed > 0 && (
        <p className="text-[11px] mb-3 rounded-lg px-3 py-2"
          style={{ color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A' }}>
          <strong>Coverage:</strong> {coverage.attributed.toLocaleString()} of{' '}
          {coverage.mdPatients.toLocaleString()} MD patients could be attributed to a subspecialty. The other{' '}
          {coverage.unattributed.toLocaleString()} are historical POS records billed as a generic
          &ldquo;Medical Consultation&rdquo; — the 2024-25 QuickBooks import, HMO consult items and clinic
          fees — which never names the doctor. Those patients sit in the comparison group of every row
          below, which pulls each figure <em>toward</em> 1, so these relationships are understated rather
          than invented.
          {coverage.multiSub > 0 && (
            <> {coverage.multiSub.toLocaleString()} patient(s) have seen more than one kind of doctor, so the
            row counts sum to slightly more than the attributed total.</>
          )}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse" style={{ width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 96 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 250 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <th className="py-2 pr-2 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>
                Doctor seen
              </th>
              {THERAPY_DEPTS.map((d) => (
                <th key={d} className="py-2 px-2 text-center font-bold" style={{ color: DEPT_COLORS[d] }}>
                  {d}
                </th>
              ))}
              <th className="py-2 pl-3 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>
                Plain Reading
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sub} style={{ borderTop: '1px solid var(--light-gray)' }}>
                <td className="py-3 pr-2 font-bold align-top" style={{ color: row.color }}>
                  {row.short}
                  <div className="font-normal text-[10px]" style={{ color: 'var(--mid-gray)' }}>
                    n={row.count.toLocaleString()}
                  </div>
                </td>

                {THERAPY_DEPTS.map((target) => {
                  const aff = row.affinities.find((a) => a.target === target)
                  if (!aff) {
                    return <td key={target} className="py-3 px-2 text-center align-top">—</td>
                  }
                  return (
                    <td key={target} className="py-2 px-2 text-center align-top"
                      style={{
                        background: dirBg(aff),
                        // Expected pairings are ringed rather than recoloured, so
                        // the direction colour still reads.
                        boxShadow: aff.expected ? `inset 0 0 0 2px ${row.color}55` : undefined,
                      }}>
                      {aff.expected && (
                        <div className="text-[9px] font-bold uppercase tracking-wide mb-0.5"
                          style={{ color: row.color }}
                          title="The referral this subspecialty is clinically expected to generate">
                          expected
                        </div>
                      )}
                      <div className="font-bold" style={{ color: 'var(--charcoal)', fontSize: 13 }}>
                        {aff.confidencePct}%
                      </div>
                      {/* The adjusted risk ratio leads, and the cell colour
                          follows it — see rrDir(). */}
                      <div className="text-[10px] mt-0.5 font-semibold" style={{ color: dirFg(aff) }}>
                        {aff.riskRatio == null ? '—'
                          : aff.riskRatio === 0 ? 'no overlap at all'
                          : (
                            <>
                              {aff.riskRatio.toFixed(2)}× as likely
                              {aff.riskCiLow != null && aff.riskCiHigh != null && (
                                <span className="font-normal" style={{ color: '#9ca3af' }}>
                                  {' '}({aff.riskCiLow.toFixed(2)}–{aff.riskCiHigh.toFixed(2)})
                                </span>
                              )}
                            </>
                          )}
                      </div>
                      <div className="text-[10px] mt-0.5 font-semibold" style={{ color: dirFg(aff) }}>
                        {dirLabel(aff)}
                      </div>
                      {/* Lift stays, uncoloured: it is unadjusted, and where it
                          disagrees with the line above, that disagreement is the
                          finding rather than something to highlight. */}
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                        Lift {aff.lift.toFixed(2)} · φ = {aff.phi >= 0 ? '+' : ''}{aff.phi.toFixed(2)}
                      </div>
                      <div className="text-[10px] mt-0.5 font-medium"
                        style={{ color: aff.pSig ? '#15803d' : '#9ca3af' }}>
                        {aff.pSig ? '✓ ' : ''}{aff.qLabel || aff.pLabel}
                      </div>
                      <div className="text-[9px] mt-0.5" style={{ color: '#9ca3af' }}>
                        {aff.coCount.toLocaleString()} shared patients
                        {aff.exact ? ' · Fisher' : ''}
                        {aff.smallCell ? ' ⚠' : ''}
                      </div>
                      {aff.ageConfounded && (
                        <div className="text-[9px] mt-0.5 font-medium" style={{ color: '#B45309' }}
                          title={`Unadjusted OR ${aff.crudeOddsRatio?.toFixed(2)} vs age-adjusted ${aff.oddsRatio?.toFixed(2)} — pediatric and adult patients differ enough that the pooled figure misleads.`}>
                          ⚠ age-confounded
                        </div>
                      )}
                    </td>
                  )
                })}

                <td className="py-3 pl-3 align-top text-[11px] leading-relaxed"
                  style={{ color: 'var(--charcoal)', borderLeft: '1px solid var(--light-gray)' }}>
                  <div className="font-semibold mb-0.5" style={{ color: row.color }}>{row.label}</div>
                  {mdSubPlainReading(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] mt-2" style={{ color: 'var(--mid-gray)' }}>
        Ringed cells are the expected pairings · ⚠ age-confounded means the raw counts and the
        age-adjusted figure disagree — read the adjusted one · Subspecialty comes from the doctor&apos;s HR
        job title on Clinic Schedule sessions, and from the POS service name where it states one
      </p>
    </div>
  )
}
