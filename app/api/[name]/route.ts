/**
 * Endpoint dispatch. Every backend call is POST /api/<name> with the input as
 * a JSON body, matching the typed client in src/lib/api.ts.
 *
 * Authorization happens here, once, rather than in each endpoint: the session
 * is resolved to a single Field Ops EML 2.0 record and that record id is the
 * only scope the endpoint receives. An endpoint cannot widen it, because no
 * endpoint takes a pro id as input.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { ApiError, HTTP_STATUS_FOR_CODE, type AnyEndpoint, type RequestUser } from '@server/lib/endpoint';
import { AirtableError } from '@server/lib/airtable';
import { endpoints } from '@server/api';
import { requireNewHire } from '@server/lib/eml';
import { getSession } from '@server/lib/session';

export const POST = async (request: NextRequest, { params }: { params: Promise<{ name: string }> }) => {
  // Who the caller is …
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not signed in' } }, { status: 401 });
  }

  const name = (await params).name;
  const endpoint = (endpoints as Record<string, AnyEndpoint>)[name];

  if (!endpoint) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: `Unknown endpoint "${name}"` } }, { status: 404 });
  }

  try {
    // … and which New Hire Readiness record they are. Refuses anyone with no
    // matching EML row before any endpoint runs.
    const user: RequestUser = await requireNewHire(session);

    let body: unknown = {};
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new ApiError({ code: 'BAD_REQUEST', message: 'Request body must be JSON' });
    }

    const input = endpoint.inputSchema.parse(body ?? {});
    const output = await endpoint.execute({ input, context: { user, requestId: randomUUID() } });
    return NextResponse.json(output ?? null);
  } catch (err) {
    return errorResponse(err);
  }
};

function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: HTTP_STATUS_FOR_CODE[err.code] });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Invalid input', issues: err.issues } }, { status: 400 });
  }
  if (err instanceof AirtableError) {
    console.error('[airtable]', err.message);
    return NextResponse.json({ error: { code: 'UPSTREAM', message: err.message } }, { status: 502 });
  }
  console.error('[api]', err);
  const message = err instanceof Error ? err.message : 'Internal error';
  return NextResponse.json({ error: { code: 'INTERNAL', message } }, { status: 500 });
}
