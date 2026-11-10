'use client'

import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

export interface DiagnosisDeptData {
  diagnoses: string[]
  depts: string[]
  cells: {
    diagnosis: string; dept: string
    male: number; female: number; other: number
    maleSessions: number; femaleSessions: number; otherSessions: number
  }[]
}

const FEMALE = '#E91E8C'
const MALE = '#1A7B8A'
const OTHER = '#9CA3AF'

// Female / male bubbles sit either side of the department column centre
const OFFSET = 0.2

const tooltipBox: React.CSSProperties = {
  background: '#fff', border: '1px solid var(--light-gray)', borderRadius: 8,
  padding: '8px 10px', fontSize: 12, color: 'var(--charcoal)',
}

function truncate(s: string, n = 28) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

interface Point {
  x: number
  y: number
  patients: number
  sessions: number
  sex: string
  diagnosis: string
  dept: string
}

export default function PatientBubbleCharts({ data }: { data: DiagnosisDeptData | null }) {
  if (!data || data.cells.length === 0) {
    return (
      <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Diagnosis × Department × Sex
        </p>
        <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--mid-gray)' }}>
          No diagnosis + confirmed-session data yet
        </div>
      </div>
    )
  }

  const { diagnoses, depts, cells } = data
  // Top-ranked diagnosis at the top of the chart (y axis grows upward)
  const yOf = (diagnosis: string) => diagnoses.length - 1 - diagnoses.indexOf(diagnosis)

  const female: Point[] = []
  const male: Point[] = []
  const other: Point[] = []
  for (const c of cells) {
    const xi = depts.indexOf(c.dept)
    const y = yOf(c.diagnosis)
    if (xi < 0 || y < 0 || y >= diagnoses.length) continue
    const base = { y, diagnosis: c.diagnosis, dept: c.dept }
    if (c.female > 0) female.push({ ...base, x: xi - OFFSET, patients: c.female, sessions: c.femaleSessions, sex: 'Female' })
    if (c.male > 0) male.push({ ...base, x: xi + OFFSET, patients: c.male, sessions: c.maleSessions, sex: 'Male' })
    if (c.other > 0) other.push({ ...base, x: xi, patients: c.other, sessions: c.otherSessions, sex: 'Other' })
  }

  const height = Math.max(380, diagnoses.length * 46 + 90)

  return (
    <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
      <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
        Diagnosis × Department × Sex
      </p>
      <p className="text-xs mt-0.5 mb-4" style={{ color: 'var(--mid-gray)' }}>
        Top {diagnoses.length} diagnoses (most patients first) · bubble size = number of patients ·
        pink = female, teal = male · hover for sessions with us ·
        a patient seen by two departments appears in both columns
      </p>
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--light-gray)" />
          <XAxis
            type="number" dataKey="x" name="Department"
            domain={[-0.6, depts.length - 0.4]}
            ticks={depts.map((_, i) => i)}
            tickFormatter={(v: number) => depts[v] ?? ''}
            orientation="top"
            tick={{ fontSize: 12, fontWeight: 700, fill: 'var(--charcoal)' }}
          />
          <YAxis
            type="number" dataKey="y" name="Diagnosis"
            domain={[-0.6, diagnoses.length - 0.4]}
            ticks={diagnoses.map((_, i) => i)}
            tickFormatter={(v: number) => truncate(diagnoses[diagnoses.length - 1 - v] ?? '')}
            width={170}
            tick={{ fontSize: 11, fill: 'var(--mid-gray)' }}
          />
          <ZAxis type="number" dataKey="patients" name="Patients" range={[60, 1100]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined
              if (!p) return null
              return (
                <div style={tooltipBox}>
                  <p style={{ fontWeight: 700, marginBottom: 2 }}>{p.diagnosis}</p>
                  <p>{p.dept} · {p.sex}</p>
                  <p>{p.patients.toLocaleString()} patient{p.patients === 1 ? '' : 's'}</p>
                  <p>{p.sessions.toLocaleString()} session{p.sessions === 1 ? '' : 's'} total</p>
                  <p>~{(p.sessions / p.patients).toFixed(1)} sessions per patient</p>
                </div>
              )
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Scatter name="Female" data={female} fill={FEMALE} fillOpacity={0.6} stroke={FEMALE} />
          <Scatter name="Male" data={male} fill={MALE} fillOpacity={0.6} stroke={MALE} />
          {other.length > 0 && (
            <Scatter name="Other" data={other} fill={OTHER} fillOpacity={0.6} stroke={OTHER} />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
