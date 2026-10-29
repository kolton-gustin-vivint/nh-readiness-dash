import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'My Readiness',
    short_name: 'Readiness',
    description: 'Your New Hire Readiness progress',
    start_url: '/',
    display: 'browser',
    background_color: '#f3f4f6',
    theme_color: '#059669',
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png' },
    ],
  };
}
