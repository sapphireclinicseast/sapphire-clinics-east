// AI content generation — powered by Claude (Anthropic)
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SCEI_BRAND_VOICE = `
You are a content writer for Sapphire Clinics East, Inc. (SCEI), a rehabilitation-focused healthcare clinic in the Philippines.

Brand voice: Authoritative, Compassionate, Innovative, Inclusive, Aspirational, Trustworthy.
Tagline: "Rehab for Every Age, Every Stage."
Tone: Professional yet warm. Avoid jargon. Speak to patients and families with empathy.
Company: Physical therapy, occupational therapy, speech therapy, pediatric SPED rehab, adult rehabilitation.
Location: Robinsons Metro East, Pasig.

DO: Use encouraging, patient-centered language. Reference the Sapphire standard of care.
DON'T: Use overly clinical jargon. Avoid generic, robotic-sounding text.
`

// ─── Brand guide analysis ────────────────────────────────────────────────────

export async function analyzeBrandGuide(text: string): Promise<{
  colors: string[]
  fonts: string[]
  tone: string
  styleNotes: string
}> {
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `Analyze this brand guide and extract the key visual and voice elements. Return ONLY a valid JSON object with keys: colors (array of hex codes or color names), fonts (array of font names), tone (string describing brand voice in 1-2 sentences), styleNotes (string with 2-3 key design principles). No explanation, just the JSON.\n\nBrand guide content:\n${text.slice(0, 8000)}`,
      },
    ],
  })

  const block = message.content[0]
  if (block.type !== 'text') return { colors: [], fonts: [], tone: '', styleNotes: '' }
  try {
    const raw = block.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(raw)
  } catch {
    return { colors: [], fonts: [], tone: block.text.slice(0, 200), styleNotes: '' }
  }
}

/**
 * Analyze a PDF brand guide using Claude's native PDF document support.
 * This properly reads and understands the full visual/text content of a PDF.
 */
export async function analyzeBrandGuidePdf(pdfBase64: string): Promise<{
  colors: string[]
  fonts: string[]
  tone: string
  styleNotes: string
}> {
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          } as any,
          {
            type: 'text',
            text: 'Analyze this brand guide PDF and extract the key visual and voice elements. Return ONLY a valid JSON object with keys: colors (array of hex codes or color names like "#FF6B35" or "Orange"), fonts (array of font names), tone (string describing brand voice in 1-2 sentences), styleNotes (string with 2-3 key design principles and any notable brand personality traits). No explanation, just the JSON.',
          },
        ],
      },
    ],
  })

  const block = message.content[0]
  if (block.type !== 'text') return { colors: [], fonts: [], tone: '', styleNotes: '' }
  try {
    const raw = block.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(raw)
  } catch {
    return { colors: [], fonts: [], tone: block.text.slice(0, 200), styleNotes: '' }
  }
}

// ─── Brand voice helpers ─────────────────────────────────────────────────────

/**
 * Build a brand-aware system prompt from stored brand guide data.
 * Falls back to the default SCEI voice if no guide is provided.
 */
export function buildBrandSystemPrompt(brandGuide?: {
  name?: string | null
  styleJson?: {
    colors?: string[]
    fonts?: string[]
    tone?: string
    styleNotes?: string
  } | null
} | null): string {
  if (!brandGuide?.styleJson) return SCEI_BRAND_VOICE

  const { tone, styleNotes, colors, fonts } = brandGuide.styleJson
  const brandName = brandGuide.name || 'the clinic'

  return `You are a content writer for ${brandName}, a healthcare clinic in the Philippines.

${tone ? `Brand voice: ${tone}` : ''}
${styleNotes ? `Design & style principles: ${styleNotes}` : ''}
${colors?.length ? `Brand colors: ${colors.join(', ')}` : ''}
${fonts?.length ? `Brand fonts: ${fonts.join(', ')}` : ''}

Tone: Professional yet warm and approachable. Speak to patients and families with empathy.
DO: Reflect the brand's visual identity and voice in your writing.
DON'T: Use generic or robotic-sounding text. Avoid overly clinical jargon.
`
}

// ─── Content generation ──────────────────────────────────────────────────────

export async function generatePostCaption(
  prompt: string,
  brandGuide?: Parameters<typeof buildBrandSystemPrompt>[0]
): Promise<string> {
  const systemPrompt = buildBrandSystemPrompt(brandGuide)

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 300,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Write a social media caption for: ${prompt}. Keep it under 150 words. Include 3-5 relevant hashtags at the end. Make it engaging and on-brand. IMPORTANT: Write in plain text only — no markdown formatting, no asterisks, no bold/italic syntax, no pound signs for headings. Facebook and Instagram do not render markdown.`,
      },
    ],
  })

  const block = message.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}

export async function generateBirthdayCaption(
  staffName: string,
  brandGuide?: Parameters<typeof buildBrandSystemPrompt>[0]
): Promise<string> {
  const systemPrompt = buildBrandSystemPrompt(brandGuide)

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 200,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Write a heartfelt birthday greeting post for our team member ${staffName}. Keep it warm, celebratory, and professional. 2-3 sentences max. Include a birthday emoji. End with relevant hashtags.`,
      },
    ],
  })

  const block = message.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}

export async function generateHolidayCaption(
  holiday: string,
  date: string,
  brandGuide?: Parameters<typeof buildBrandSystemPrompt>[0]
): Promise<string[]> {
  const systemPrompt = buildBrandSystemPrompt(brandGuide)

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 600,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Generate 3 different social media captions for ${holiday} (${date}). Each option should have a different tone (1: warm/family-focused, 2: inspirational, 3: community-celebrating). Keep each under 100 words. Include relevant hashtags. Return ONLY a valid JSON object with a "captions" key containing an array of 3 strings. No explanation, just the JSON.`,
      },
    ],
  })

  const block = message.content[0]
  if (block.type !== 'text') return []
  try {
    // Strip markdown code fences Claude may have added around the JSON
    const raw = block.text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(raw)
    return parsed.captions ?? []
  } catch {
    return [block.text.trim()]
  }
}

export async function generateEmailBody(
  prompt: string,
  brandGuide?: Parameters<typeof buildBrandSystemPrompt>[0]
): Promise<string> {
  const systemPrompt = buildBrandSystemPrompt(brandGuide)

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 600,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Write an email newsletter for patients: ${prompt}. Write in plain text, warm and professional. Include a greeting, main content, and a closing. Keep it under 300 words.`,
      },
    ],
  })

  const block = message.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}
