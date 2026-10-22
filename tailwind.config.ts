import type { Config } from 'tailwindcss';

/**
 * Mobile-first by default: no `sm:`/`md:` prefix means phone, and the page is
 * designed to need no breakpoints at all. The doc's interface-style rule is
 * "mobile-first, simple status cards, limited scrolling", so the only desktop
 * concession is a max-width container.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Readiness stage colours, used by the stage chip and the card accents.
        stage: {
          training: '#64748b',
          review: '#0ea5e9',
          remediation: '#f59e0b',
          approved: '#16a34a',
          historical: '#94a3b8',
        },
      },
      maxWidth: {
        page: '32rem',
      },
    },
  },
  plugins: [],
};

export default config;
