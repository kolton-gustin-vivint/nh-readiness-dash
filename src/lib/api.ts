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
    // 401 means no session; 403 means a session with no matching EML record.
    // Both are shown to the user as text rather than a blank page — see
    // MyReadiness.tsx. Once Magistrate is wired up a 401 should redirect to
    // /magistrate-auth instead.
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
