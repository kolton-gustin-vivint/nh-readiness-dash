/**
 * Typed client for the API. Each function POSTs its input to /api/<name> and
 * returns the endpoint's output. Input/output types are inferred from the
 * endpoint definitions in server/api, so they stay in sync.
 */
import type { z } from 'zod';
import type { Endpoints, EndpointName } from '@server/api';

export type InputOf<N extends EndpointName> = z.infer<Endpoints[N]['inputSchema']>;
export type OutputOf<N extends EndpointName> = z.infer<Endpoints[N]['outputSchema']>;

type Args<N extends EndpointName> = undefined extends InputOf<N> ? [input?: InputOf<N>] : [input: InputOf<N>];

export class ApiClientError extends Error {
  status: number;
  code: string;
  issues?: unknown;
  constructor(status: number, code: string, message: string, issues?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export async function callEndpoint<N extends EndpointName>(name: N, input?: InputOf<N>): Promise<OutputOf<N>> {
  const res = await fetch(`/api/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input ?? {}),
  });

  if (!res.ok) {
    let code = 'ERROR';
    let message = `${res.status} ${res.statusText}`;
    let issues: unknown;
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
      issues = body?.error?.issues;
    } catch {
      /* non-JSON error body */
    }

    // 401 means the session is missing or has expired — Magistrate sessions
    // are fixed at 8 hours and there is no refresh — so send them to sign in
    // and come back. `next_page` matches what the package's own redirect uses.
    //
    // 403 is different and must NOT redirect: it means a valid session whose
    // email matches no EML record. Bouncing that to sign-in would loop,
    // because signing in again cannot change the outcome. It is surfaced as
    // text instead.
    if (res.status === 401 && typeof window !== 'undefined') {
      const url = new URL(`${window.location.origin}/magistrate-auth`);
      url.searchParams.set('next_page', window.location.origin + window.location.pathname);
      window.location.href = url.toString();
    }

    throw new ApiClientError(res.status, code, message, issues);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as OutputOf<N>;
}

function endpoint<N extends EndpointName>(name: N) {
  return (...args: Args<N>): Promise<OutputOf<N>> => callEndpoint(name, args[0] as InputOf<N>);
}

export const getMyReadiness = endpoint('getMyReadiness');
export type GetMyReadinessOutputType = OutputOf<'getMyReadiness'>;

export const getMyFieldExperience = endpoint('getMyFieldExperience');
export type GetMyFieldExperienceOutputType = OutputOf<'getMyFieldExperience'>;
