import type { MetadataRoute } from 'next';

// Served at /manifest.webmanifest; Next links it automatically.
// Scope is the volunteer app only — the coordinator dashboard is not part of the PWA.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LUWAS Volunteer',
    short_name: 'LUWAS',
    description: 'Offline-first field reporting for disaster response volunteers.',
    start_url: '/volunteer',
    scope: '/volunteer',
    display: 'standalone',
    background_color: '#0B0C0E',
    theme_color: '#0B0C0E',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
