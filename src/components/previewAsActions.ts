'use server';

/**
 * TEMPORARY — server actions for the "Preview as" box.
 *
 * ----------------------------------------------------------------------------
 * DELETE BEFORE GO-LIVE. See src/components/PreviewAs.tsx for the removal list.
 * ----------------------------------------------------------------------------
 *
 * These set and clear the cookie that server/lib/session.ts reads. Both refuse
 * outright in production: this is an auth bypass by design, so it is guarded
 * here as well as in the session seam, the roster loader and the component.
 *
 * A server action is used rather than a route handler because the box is
 * rendered by a server component and needs no client-callable API surface —
 * an endpoint that accepted "become this pro" would be a new thing to secure.
 */
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { env } from '@server/lib/env';
import { PREVIEW_AS_COOKIE } from '@server/lib/session';

/** Airtable record ids are `rec` + 14 alphanumerics. */
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

export async function setPreviewAs(recordId: string): Promise<void> {
  if (env.isProd) return;
  if (!RECORD_ID.test(recordId)) return;

  (await cookies()).set(PREVIEW_AS_COOKIE, recordId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // Session cookie: closing the browser ends the preview, so a forgotten
    // selection cannot persist into a later session.
    maxAge: undefined,
  });

  revalidatePath('/');
}

export async function clearPreviewAs(): Promise<void> {
  if (env.isProd) return;
  (await cookies()).delete(PREVIEW_AS_COOKIE);
  revalidatePath('/');
}
