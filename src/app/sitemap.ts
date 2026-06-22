import type { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://coacheshive.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  const routes = [
    '/organizations',
    '/coaches',
    '/athletes',
    '/pricing',
    '/',
    '/platform-preview',
    '/about',
    '/how-it-works',
    '/contact',
    '/safety',
    '/terms',
    '/privacy',
    '/refund',
  ]

  return routes.map((route, index) => ({
    url: `${siteUrl}${route}`,
    lastModified,
    changeFrequency: index < 5 ? 'weekly' : 'monthly',
    priority: index < 4 ? 1 : route === '/' ? 1 : 0.7,
  }))
}
