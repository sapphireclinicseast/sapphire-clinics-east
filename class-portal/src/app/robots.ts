import type { MetadataRoute } from 'next'

/**
 * Robots policy for the public class portal. Only the marketing /
 * enrolment surface is crawlable — every authenticated and
 * per-student route is excluded so Google doesn't try to index
 * uploaded documents, in-flight enrolments, payments, or any other
 * personal information.
 *
 * Google honours both this file and per-page noindex metadata; we use
 * disallow here for crawl-budget hygiene and rely on Next's route
 * metadata for the de-indexing signal on anything that does get reached.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/about', '/enroll', '/sign-in'],
        disallow: [
          '/api/',
          '/admin',
          '/admin/',
          '/frontdesk',
          '/frontdesk/',
          '/profile',
          '/profile/',
          '/classes',
          '/classes/',
          '/calendar',
          '/calendar/',
          '/pay',
          '/pay/',
          '/reset',
          '/reset/',
          '/account-setup',
          '/account-setup/',
          '/upload/',
          '/waiver',
          '/waiver/',
          '/documents',
          '/documents/',
          '/admission',
          '/admission/',
        ],
      },
    ],
    sitemap: 'https://class.sapphireclinicseast.org/sitemap.xml',
    host: 'https://class.sapphireclinicseast.org',
  }
}
