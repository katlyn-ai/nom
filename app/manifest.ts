import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NOM — Meal Planning',
    short_name: 'NOM',
    description: 'AI-powered meal planning, recipe management, and smart grocery shopping.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#F5F0E8',
    theme_color: '#2D5438',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  }
}
