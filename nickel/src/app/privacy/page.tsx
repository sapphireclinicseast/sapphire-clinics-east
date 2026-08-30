export const metadata = { title: 'Privacy Policy' }

const UPDATED = 'August 30, 2026'

function H({ children }: { children: React.ReactNode }) { return <h2 className="mt-6 text-[16px] font-semibold text-[color:var(--ink)]">{children}</h2> }
function P({ children }: { children: React.ReactNode }) { return <p className="mt-2 text-[13.5px] leading-relaxed text-[color:var(--slate)]">{children}</p> }
function LI({ children }: { children: React.ReactNode }) { return <li className="text-[13.5px] leading-relaxed text-[color:var(--slate)]">{children}</li> }

export default function PrivacyPage() {
  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      <div className="card">
        <h1 className="text-[24px] font-semibold text-[color:var(--ink)]">Privacy Policy</h1>
        <P>Last updated: {UPDATED}. This Policy explains how Nickel, operated by Jara Universal OPC (“JUO”, “we”) in partnership with Sapphire Clinics East, Inc. (“SCEI”), collects, uses, and protects your personal information when you use the Nickel website and apps (“Nickel”). We comply with Republic Act No. 10173 (the Data Privacy Act of 2012), its Implementing Rules, and the issuances of the National Privacy Commission (“NPC”).</P>

        <H>Who this covers</H>
        <P>Patients who book care, therapists who provide it, and rehab doctors who run consults and issue referrals through Nickel.</P>

        <H>Information we collect</H>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <LI><b>Account details</b> — name, email, phone, password (stored only as a secure hash), and home address (for patients, to enable home visits).</LI>
          <LI><b>Health-related information</b> — the reason for your visit or consult, doctor’s referrals you upload or that a doctor issues, and consult notes. This is sensitive personal information and is treated with heightened protection.</LI>
          <LI><b>Provider &amp; doctor credentials</b> — PRC licence details, specialization, and payout details (bank/GCash), used to verify professionals and to pay them.</LI>
          <LI><b>Booking &amp; payment records</b> — sessions and consults booked, amounts, and payment status. Card and e-wallet details are entered directly with our payment processor; we never see or store your full card number.</LI>
          <LI><b>Usage &amp; device data</b> — basic technical logs needed to operate and secure the service.</LI>
        </ul>

        <H>How we use your information</H>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <LI>To create and manage your account and match patients with therapists and doctors.</LI>
          <LI>To process bookings, consults, payments, refunds (to your Nickel wallet), and payouts.</LI>
          <LI>To run video teleconsults and to enable messaging and notifications between you and your provider or doctor.</LI>
          <LI>To verify professional licences and keep the service safe.</LI>
          <LI>To meet legal, tax, and regulatory obligations.</LI>
        </ul>

        <H>Payments</H>
        <P>Payments are processed by <b>PayMongo</b>, our payment channel partner. Your payment is handled on PayMongo’s secure systems under their privacy policy; we receive only confirmation of payment and the method used, not your full card details.</P>

        <H>Teleconsults (video)</H>
        <P>Teleconsults are conducted over Nickel’s own LiveKit video service. Video and audio are streamed in real time between you and your doctor. Nickel does not record teleconsults.</P>

        <H>How we share information</H>
        <P>We share only what is necessary: with the therapist or doctor you book (to deliver care), with our payment processor (to collect payment and pay providers), and with regulators or authorities where the law requires. We do not sell your personal information.</P>

        <H>Retention</H>
        <P>We keep your information for as long as your account is active and as required by law (including tax and health-record retention). You may request deletion, subject to those legal requirements.</P>

        <H>Your rights</H>
        <P>Under the Data Privacy Act you have the right to be informed, to access, to object, to rectification, to erasure or blocking, to data portability, and to damages, and you may complain to the NPC. To exercise these rights, contact our Data Protection Officer below.</P>

        <H>Security</H>
        <P>We use industry-standard safeguards, including encryption in transit, hashed passwords, and access controls. No system is perfectly secure, but we work to protect your information and will notify you and the NPC of a breach where the law requires.</P>

        <H>Children</H>
        <P>Where care is for a minor, it must be arranged and consented to by a parent or guardian, who is responsible for the information they provide.</P>

        <H>Contact — Data Protection Officer</H>
        <P>Jan De Asis, Data Protection Officer<br />Email: <a className="font-semibold text-[color:var(--steel)] hover:underline" href="mailto:jpdeasis.scei@gmail.com">jpdeasis.scei@gmail.com</a><br />Jara Universal OPC, in partnership with Sapphire Clinics East, Inc. — Robinsons Metro East, Pasig City, Philippines</P>

        <H>Changes</H>
        <P>We may update this Policy from time to time. Material changes will be posted here with a new “last updated” date.</P>
      </div>
    </div>
  )
}
