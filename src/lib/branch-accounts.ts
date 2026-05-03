/**
 * Maps branch identifiers to their connected social media accounts.
 *
 * East      → "Sandbox Clinic East" (FB)  + @sandboxcliniceast (IG)
 * Greenhills → "Sandbox Clinic Greenhills" (FB) + @sandboxclinicgh (IG)
 * Verdana   → "Verdana Store" (FB)         + @verdanarehab (IG)
 */

import { prisma } from './prisma'

// Keywords used for case-insensitive pageName matching.
// Each branch entry contains one or more substrings that uniquely identify
// its Facebook page and/or Instagram account in the SocialAccount table.
const BRANCH_KEYWORDS: Record<string, string[]> = {
  east: ['east'],
  greenhills: ['greenhills', 'clinicgh'],  // 'clinicgh' catches 'sandboxclinicgh'
  verdana: ['verdana'],
}

/**
 * Returns the SocialAccount IDs whose pageName matches the given branch
 * and whose platform is one of the requested platforms.
 *
 * Returns an empty array if the branch is unknown or unrecognised.
 */
export async function getAccountIdsForBranch(
  branch: string,
  platforms: string[]
): Promise<string[]> {
  const keywords = BRANCH_KEYWORDS[branch.toLowerCase()] ?? []
  if (!keywords.length || !platforms.length) return []

  const accounts = await prisma.socialAccount.findMany({
    where: {
      AND: [
        { platform: { in: platforms as any } },
        {
          OR: keywords.map((kw) => ({
            pageName: { contains: kw, mode: 'insensitive' as const },
          })),
        },
      ],
    },
    select: { id: true },
  })

  return accounts.map((a) => a.id)
}
