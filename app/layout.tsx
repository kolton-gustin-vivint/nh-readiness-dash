import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'My Readiness',
  description: 'Your New Hire Readiness progress',
  appleWebApp: { title: 'My Readiness' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom stays enabled deliberately. Disabling it is a common mobile
  // default and an accessibility regression.
  maximumScale: 5,
  themeColor: '#059669',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
