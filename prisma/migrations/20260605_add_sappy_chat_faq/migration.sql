-- Sappy chatbot: admin-editable FAQ templates + copy settings.
-- Idempotent so re-running the migrate container is safe.

CREATE TABLE IF NOT EXISTS "ChatFaq" (
    "id"        TEXT NOT NULL,
    "label"     TEXT NOT NULL DEFAULT '',
    "keywords"  TEXT NOT NULL,
    "answer"    TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled"   BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatFaq_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatFaq_enabled_sortOrder_idx" ON "ChatFaq"("enabled", "sortOrder");

CREATE TABLE IF NOT EXISTS "ChatSetting" (
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatSetting_pkey" PRIMARY KEY ("key")
);

-- ── Seed the current hardcoded FAQ entries (ON CONFLICT keeps edits) ─────────
INSERT INTO "ChatFaq" ("id", "label", "keywords", "answer", "sortOrder") VALUES
('faq_book', 'How do I book?', 'book,schedule,appointment,how do i book,how to book',
'You can book online at client.sapphireclinicseast.org:
1. Sign in (returning) or register (new patient).
2. Pick your branch + service.
3. Choose a therapist and up to 3 preferred time slots.
4. The front desk will confirm one choice and email you a payment link.
Once the downpayment is received, your slot is confirmed.', 10),

('faq_services', 'What are your services?', 'service,what services,offer,therapy',
'We offer:
• Physical Therapy (PT)
• Occupational Therapy (OT)
• Speech-Language Pathology (SLP)
• Special Education (SPED)
• Medical Doctor (MD)
• Psychology
• Orthosis / Prosthesis (Sandbox East only)
• Psychiatry (Sandbox GH only)
• Developmental Pediatrician (Sandbox GH only)', 20),

('faq_downpayment', 'Downpayment', 'downpayment,deposit,payment,how much,fee,cost,price',
'Downpayment rates per session (PHP):

Sandbox East:
• PT — ₱500
• OT, SLP, MD, Psychology — ₱1,000
• SPED — ₱500

Sandbox Greenhills:
• PT, OT, SLP, SPED, MD, Psychology, Psychiatry — ₱1,000
• Developmental Pediatrician — ₱6,000

Payment is via PayMongo (card, GCash, Maya) after front-desk approval.', 30),

('faq_hours', 'Clinic hours', 'hours,open,time,schedule of clinic,clinic hours',
'Clinic hours:
• Sandbox East — Mon–Sat, 10:00 AM to 8:00 PM
• Sandbox Greenhills — Mon–Sat, 9:00 AM to 7:00 PM
(Closed Sundays; holiday hours may vary.)', 40),

('faq_teletherapy', 'Teletherapy', 'teletherapy,online,remote,virtual,video',
'Yes — we offer teletherapy for select services. When you book, tick the ''Request teletherapy'' option. Once the front desk approves and your downpayment is received, you''ll get a secure meeting link in your My Bookings page.', 50),

('faq_cancellation', 'Cancellation', 'cancel,cancellation,reschedule,no-show,no show,miss',
'Cancellations made ≥ 24 hours in advance are free. Cancellations under 24 hours or no-shows may incur a fee equal to the session downpayment. Please contact the front desk as soon as possible.', 60),

('faq_location', '', 'location,address,where,branch',
'We have two branches:
• Sandbox East — San Pedro, Laguna
• Sandbox Greenhills — Greenhills, San Juan
For exact addresses and directions, visit sapphireclinicseast.org.', 70),

('faq_contact', '', 'contact,phone,email,number,call',
'You can reach us:
• Email: info@sapphireclinicseast.org
• Website: sapphireclinicseast.org
• For booking help, use the Contact form on our main site or message us on Facebook/Viber.', 80),

('faq_hmo', '', 'hmo,insurance,philhealth,maxicare,medicard',
'We accept several HMO providers. Please check with our front desk before booking to confirm coverage and any co-pay. Downpayments may still apply depending on your plan.', 90),

('faq_vip', '', 'vip,prepaid,reward,points,package',
'We offer VIP and Prepaid Card packages that come with session discounts and reward points. Ask the front desk for current promos and tier benefits.', 100),

('faq_refund', '', 'refund,money back',
'Downpayments are generally non-refundable but can be credited to a future session if cancelled at least 24 hours in advance. For special cases, please contact the front desk.', 110)
ON CONFLICT ("id") DO NOTHING;

-- ── Seed editable copy settings ─────────────────────────────────────────────
INSERT INTO "ChatSetting" ("key", "value") VALUES
('intro_message', 'Hi! I''m Sappy, the Sapphire Clinics East assistant. Ask me anything about booking, services, or our clinics — or tap one of the quick questions below.'),
('fallback_message', 'I don''t have an answer for that yet — please use the quick questions below, or contact the clinic at info@sapphireclinicseast.org.'),
('system_prompt', 'You are Sappy, a warm, concise assistant for Sapphire Clinics East (SCEI), a pediatric and adult therapy clinic in the Philippines with two branches: Sandbox East (San Pedro, Laguna) and Sandbox Greenhills (San Juan).

You help patients with questions about:
- Booking appointments at client.sapphireclinicseast.org
- Services (PT, OT, SLP, SPED, MD, Psychology, Orthosis, Psychiatry, Developmental Pediatrician)
- Downpayments (PT at SBEA is ₱500; most others are ₱1,000; DevPedia at SBGH is ₱6,000)
- Clinic hours (SBEA 10am-8pm, SBGH 9am-7pm, Mon-Sat)
- Teletherapy, cancellation policy, HMO acceptance, VIP/prepaid packages

Rules:
- Keep answers under 120 words, warm and clear.
- If asked something outside SCEI scope, politely redirect to contacting the clinic.
- Never make up phone numbers, doctor names, or specific availability — tell them to use the booking portal.
- Never give medical advice. If asked medical questions, suggest booking a consult.
- Prefer bullet points for multi-part answers.')
ON CONFLICT ("key") DO NOTHING;
