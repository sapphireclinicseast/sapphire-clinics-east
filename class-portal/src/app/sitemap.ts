import type { MetadataRoute } from 'next'

/**
 * Sitemap for the public marketing surface of class.sapphireclinicseast.org.
 *
 * Only crawlable pages live here — every authenticated route is
 * excluded (see ./robots.ts for the matching disallow list). Update
 * lastModified when the marketing copy meaningfully changes so search
 * crawlers re-fetch promptly.
 */
const BASE = 'https://class.sapphireclinicseast.org'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-05-25')
  return [
    {
      url: `${BASE}/`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE}/about`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${BASE}/enroll`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${BASE}/sign-in`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}
