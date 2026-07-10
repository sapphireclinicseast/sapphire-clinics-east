// POST /api/public/ugat/admin/seed-samples   (MAIN_ADMIN only)
// Creates 3 sample students with fully filled-out, SUBMITTED Part-I
// applications (answers + a drawn signature + letter/grades PDFs) so the
// admin can exercise the review + approve/disapprove flow. Idempotent:
// re-running wipes the previous "sample.*" accounts and recreates them.
//
// DELETE removes all sample.* accounts (cleanup after the demo).

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, hashPassword } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

const PASSWORD = 'sample123'

const SAMPLES = [
  {
    username: 'sample.maria', track: 'ARAL', firstName: 'Maria Clara', middleName: 'Bautista', lastName: 'Santos',
    studentNumber: '2021-45123', expectedGraduationYear: 2027, birthdate: '2003-04-18',
    school: 'University of the Philippines Manila (College of Allied Medical Professions)',
    program: 'Speech-Language Pathology', preferredField: 'Pediatric Speech Therapy',
    city: 'Manila', region: 'NCR', zip: '1000', addr1: '24 Kalayaan St.', addr2: 'Barangay Malaya',
    professionalEmail: 'mcsantos@up.edu.ph', personalEmail: 'maria.santos.demo@gmail.com',
    answers: {
      q1WhyApply: 'I am applying because the UGAT Fellowship is the rare kind of support that sees a student as a whole person, not just a set of grades. A monthly stipend during internship would let me finish my clinical training without taking on side jobs that pull me away from my cases. More than the financial help, I want to grow inside a clinic that clearly values galing and paglilingkod — I want to become the kind of clinician who is both excellent and grounded.',
      q2Initiatives: 'In my third year I led a weekend "Salita at Laro" program in our barangay where we screened children for speech and language delays and coached parents on simple home activities. I also volunteered as a note-taker and buddy for a deaf classmate, which taught me patience and how much small accommodations matter. These are small things, but they are where galing (doing the work well), aral (learning together), and tindig (showing up honestly) meet for me.',
      q3WhyProgram: 'I chose Speech-Language Pathology after watching my younger cousin, who has autism, light up the first time a therapist helped him ask for water using a picture board. That moment showed me that communication is dignity. I wanted a profession where patience and creativity directly give people back their voice.',
      q4StipendUse: 'The stipend would cover my daily transportation to my clinical rotations, therapy materials I make for my pediatric cases, and part of my board-review costs. It would also let me send a little home so my family does not carry my internship expenses alone.',
      q5ReturnService: 'I am fully willing to render the full return service and would gladly stay well beyond the required hours. Honestly, I would consider it a privilege to begin my career at Aura, so I am open to a long-term commitment of several years and to continuing after my obligation is complete.',
      q6ArawNgKalinga: 'Yes, absolutely. Community screening is exactly why I entered this field. I would happily take an active role in Araw ng Kalinga — from doing the actual screenings to helping organize and document them — and I would want to keep participating every year.',
      q7FiveYearPlan: 'Within five years I hope to be a licensed SLP with solid pediatric experience at Aura, pursuing continuing education in early intervention and, eventually, supervising interns myself. I want to help build the same kind of community screening programs that first inspired me.',
    },
  },
  {
    username: 'sample.juan', track: 'ARAL', firstName: 'Juan Miguel', middleName: 'Reyes', lastName: 'Dela Cruz',
    studentNumber: 'UST-2021-0392', expectedGraduationYear: 2027, birthdate: '2002-11-02',
    school: 'University of Santo Tomas (College of Rehabilitation Sciences)',
    program: 'Occupational Therapy', preferredField: 'Pediatric Occupational Therapy',
    city: 'Quezon City', region: 'NCR', zip: '1105', addr1: '112 Maginhawa St.', addr2: 'Teachers Village',
    professionalEmail: 'jmdelacruz@ust.edu.ph', personalEmail: 'juanmiguel.demo@gmail.com',
    answers: {
      q1WhyApply: 'I am applying because I want my final internship year to be about learning as much as I can, not scrambling to make ends meet. The fellowship would give me the stability to be fully present with my patients. I am also drawn to Aura because the return-service model feels honest and fair — you invest in us, and we give real, meaningful hours back. That is a partnership I want to be part of.',
      q2Initiatives: 'I co-founded a small student org that builds low-cost sensory kits for public-school special-education classrooms. We reused donated materials and trained the teachers to use them. I also spent two summers as a volunteer aide at a home for children with cerebral palsy. Those experiences taught me that excellence (galing) is meaningless unless it actually reaches the people who need it (paglilingkod).',
      q3WhyProgram: 'I chose Occupational Therapy because I like solving practical, human problems — helping a child hold a spoon, or a stroke survivor button a shirt again. It is a field where creativity and empathy have measurable results, and where "small wins" genuinely change a family’s daily life.',
      q4StipendUse: 'I would use the stipend for transportation, materials for my patient activities, and my licensure review. A portion would go to helping with our household bills so my parents can breathe a little easier during my last year.',
      q5ReturnService: 'I am very willing to fulfill the full return service, and I would like to stay on afterward. I see this as the start of my career, not a debt to clear — I am open to committing for the long term and building my practice at Aura.',
      q6ArawNgKalinga: 'Yes, gladly. I already love community work, and Araw ng Kalinga sounds like exactly the kind of initiative I would want to help run. I am happy to be hands-on every year, whether screening, treating, or organizing.',
      q7FiveYearPlan: 'In five years I see myself as a licensed OT with strong pediatric and community-rehab experience, ideally mentoring newer therapists at Aura and helping expand our outreach into underserved areas.',
    },
  },
  {
    username: 'sample.andrea', track: 'TINDIG', firstName: 'Andrea Nicole', middleName: 'Lim', lastName: 'Reyes',
    studentNumber: 'DLS-2020-1187', expectedGraduationYear: 2026, birthdate: '2002-07-25',
    school: 'De La Salle Medical and Health Sciences Institute',
    program: 'Speech-Language Pathology', preferredField: 'Adult Neuro Rehabilitation',
    city: 'Dasmariñas', region: 'Region IV-A', zip: '4114', addr1: '8 Aguinaldo Highway', addr2: 'Barangay Salawag',
    professionalEmail: 'anreyes@dlshsi.edu.ph', personalEmail: 'andrea.reyes.demo@gmail.com',
    answers: {
      q1WhyApply: 'I am applying because I want to specialize in adult neuro-rehabilitation, and Aura’s clinics see exactly the caseload I hope to learn from. The stipend would let me focus on that learning instead of worrying about internship costs. I also value that the fellowship expects integrity (tindig) from its scholars — that is the kind of standard I want to be held to as I start my career.',
      q2Initiatives: 'I organized a "Kwentuhan Sessions" project at a local elder-care center, where we helped older adults with aphasia practice conversation in a low-pressure, joyful way. I also tutored underclassmen in phonetics for free because I remembered how lost I felt in that subject. For me, aral is something you pass on, not hoard.',
      q3WhyProgram: 'I chose Speech-Language Pathology after my lola had a stroke and slowly relearned to speak with the help of a therapist. Watching her fight for each word — and win — made me want to be the person who walks that road with families.',
      q4StipendUse: 'The stipend would go to my commute to clinical sites, assessment and therapy materials for my adult cases, and my board-exam review. I would also set aside a small amount for my lola’s maintenance medicines.',
      q5ReturnService: 'I am committed to completing the full return service and would be honored to keep working with the clinic afterward. I am open to a multi-year commitment because I genuinely want to build my neuro-rehab practice at Aura.',
      q6ArawNgKalinga: 'Yes, definitely. Giving back through free screening and treatment is close to my heart after my own family’s experience. I would be an active participant in Araw ng Kalinga and would love to help it grow each year.',
      q7FiveYearPlan: 'Within five years I hope to be a licensed SLP with focused adult neuro-rehab experience at Aura, taking continuing education in dysphagia and aphasia therapy, and helping mentor interns who are drawn to this specialty.',
    },
  },
]

async function makeSignature(name: string): Promise<Buffer | null> {
  try {
    const mod = await import('canvas')
    const c = mod.createCanvas(440, 150)
    const x = c.getContext('2d')
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 440, 150)
    x.fillStyle = '#1f2d31'
    x.font = 'italic 44px "DejaVu Serif", serif'
    x.fillText(name, 24, 92)
    x.strokeStyle = '#b9c4c0'; x.beginPath(); x.moveTo(24, 112); x.lineTo(416, 112); x.stroke()
    return c.toBuffer('image/png')
  } catch { return null }
}

async function makePdf(title: string, body: string): Promise<Buffer | null> {
  try {
    const { jsPDF } = await import('jspdf')
    const d = new jsPDF()
    d.setFontSize(16); d.text(title, 20, 25)
    d.setFontSize(11)
    d.text(d.splitTextToSize(body, 170), 20, 40)
    return Buffer.from(d.output('arraybuffer'))
  } catch { return null }
}

export async function POST(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || tok.role !== 'MAIN_ADMIN') {
    return NextResponse.json({ error: 'Main administrator only.' }, { status: 403 })
  }

  // Wipe any prior samples (cascade removes their apps + uploads).
  await prisma.ugatScholar.deleteMany({ where: { username: { startsWith: 'sample.' } } })

  const passwordHash = await hashPassword(PASSWORD)
  const created: string[] = []

  for (const p of SAMPLES) {
    const scholar = await prisma.ugatScholar.create({
      data: {
        username: p.username, track: p.track, professionalEmail: p.professionalEmail, personalEmail: p.personalEmail,
        passwordHash, passwordPlain: PASSWORD,
        firstName: p.firstName, middleName: p.middleName, lastName: p.lastName,
        studentNumber: p.studentNumber, expectedGraduationYear: p.expectedGraduationYear,
        birthdate: new Date(p.birthdate),
        school: p.school, program: p.program, preferredField: p.preferredField,
        permAddress1: p.addr1, permAddress2: p.addr2, permCity: p.city, permRegion: p.region, permZip: p.zip,
        presSameAsPerm: true,
        presAddress1: p.addr1, presAddress2: p.addr2, presCity: p.city, presRegion: p.region, presZip: p.zip,
        emailVerifiedAt: new Date(), status: 'APPLIED',
      },
      select: { id: true },
    })

    await prisma.ugatApplication.create({
      data: {
        scholarId: scholar.id, track: p.track,
        ...p.answers,
        truthAffirmed: true, signedAt: new Date(), submittedAt: new Date(), initialDecision: 'PENDING',
      },
    })

    const fullName = `${p.firstName} ${p.lastName}`
    const sig = await makeSignature(fullName)
    if (sig) await prisma.ugatUpload.create({ data: { scholarId: scholar.id, kind: 'SIGNATURE', filename: 'signature.png', mimeType: 'image/png', data: sig } })

    const letter = await makePdf('Motivational Letter — ' + fullName,
      `Dear UGAT Fellowship Team,\n\nMy name is ${fullName}, a final-year ${p.program} intern at ${p.school}. It is with great hope and sincerity that I submit my application to the UGAT Fellowship Program.\n\nThroughout my training I have tried to live out galing, aral, and tindig — striving to do my work well, to keep learning humbly, and to act with integrity even when no one is watching. This fellowship would not only ease the financial weight of my internship; it would place me in a community that shares those same values.\n\nI am ready to give back through meaningful service, and I would be honored to grow into a licensed clinician at Aura Health Rehab.\n\nWith respect and gratitude,\n${fullName}`)
    if (letter) await prisma.ugatUpload.create({ data: { scholarId: scholar.id, kind: 'LETTER', filename: 'motivational-letter.pdf', mimeType: 'application/pdf', data: letter } })

    if (p.track === 'TINDIG') {
      const tor = await makePdf(`Transcript of Records — ${fullName}`, `${fullName}\n${p.school}\n${p.program} (Graduate)\n\nSample transcript of records (placeholder document for the demo).\nGeneral weighted average: 1.62`)
      if (tor) await prisma.ugatUpload.create({ data: { scholarId: scholar.id, kind: 'TOR', filename: 'transcript-of-records.pdf', mimeType: 'application/pdf', data: tor } })
      const grad = await makePdf(`Proof of Graduation — ${fullName}`, `${fullName}\n${p.school}\n${p.program}\n\nThis certifies that the above-named has completed the degree program and the clinical internship requirement (placeholder document for the demo).`)
      if (grad) await prisma.ugatUpload.create({ data: { scholarId: scholar.id, kind: 'GRAD_PROOF', filename: 'proof-of-graduation.pdf', mimeType: 'application/pdf', data: grad } })
    } else {
      for (const yr of [1, 2, 3]) {
        const g = await makePdf(`Proof of Grades — Year ${yr}`, `${fullName}\n${p.school}\n${p.program}\n\nSample Year ${yr} grade report (placeholder document for the demo).\nGeneral weighted average: ${(1.75 - yr * 0.05).toFixed(2)}`)
        if (g) await prisma.ugatUpload.create({ data: { scholarId: scholar.id, kind: `GRADES_Y${yr}`, filename: `grades-year-${yr}.pdf`, mimeType: 'application/pdf', data: g } })
      }
    }

    created.push(p.username)
  }

  return NextResponse.json({ ok: true, created, password: PASSWORD })
}

export async function DELETE(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || tok.role !== 'MAIN_ADMIN') return NextResponse.json({ error: 'Main administrator only.' }, { status: 403 })
  const r = await prisma.ugatScholar.deleteMany({ where: { username: { startsWith: 'sample.' } } })
  return NextResponse.json({ ok: true, deleted: r.count })
}
