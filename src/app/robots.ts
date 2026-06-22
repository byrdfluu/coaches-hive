import type { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://coacheshive.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/', '/athlete/', '/coach/', '/org/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
