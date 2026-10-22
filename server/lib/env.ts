import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const isProd = process.env.NODE_ENV === 'production';
/** Set automatically by Vercel. */
export const isVercel = Boolean(process.env.VERCEL);

const defaultPublicUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : `http://localhost:${process.env.PORT || 3000}`;

/**
 * Server-side configuration.
 *
 * `devUserEmail` is the stand-in for a real session until Magistrate is wired
 * up. It is deliberately read here but gated in server/lib/session.ts, which
 * refuses it in production — this object only reports what is set, it does not
 * decide whether it may be used.
 */
export const env = {
  isProd,
  isVercel,
  publicUrl: (process.env.PUBLIC_URL || defaultPublicUrl).replace(/\/$/, ''),
  airtableApiKey: req('AIRTABLE_API_KEY'),
  airtableBaseId: process.env.AIRTABLE_BASE_ID,
  devUserEmail: process.env.DEV_USER_EMAIL || '',
  devUserRecordId: process.env.DEV_USER_RECORD_ID || '',
};
