import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Coaches Hive',
    short_name: 'Coaches Hive',
    description: 'Find programs, register athletes, sign waivers, and pay organizations.',
    start_url: '/organizations?source=pwa',
    scope: '/',
    display: 'standalone',
    background_color: '#f9f9f9',
    theme_color: '#191919',
    orientation: 'portrait-primary',
    categories: ['sports', 'lifestyle'],
    icons: [
      { src: '/CHLogoTransparent.PNG', sizes: '500x500', type: 'image/png', purpose: 'any' },
      { src: '/CH Favicon.png', sizes: '2000x2000', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
