import type { z } from 'zod';

/** Error type endpoints throw to control the HTTP status the client sees. */
export type ApiErrorCode = 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL';

export class ApiError extends Error {
  code: ApiErrorCode;
  constructor(opts: { code: ApiErrorCode; message: string }) {
    super(opts.message);
    this.name = 'ApiError';
    this.code = opts.code;
  }
}

export const HTTP_STATUS_FOR_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
};

/**
 * The signed-in new hire as seen by endpoints.
 *
 * `id` is their `Field Ops EML 2.0` record id, resolved from the session email
 * by `requireNewHire`. Every read in this app is scoped to it — the doc's §9
 * access matrix gives the NH role "Own" on WO Forms and the self-assessment
 * and "No" on everything else, so there is no wider scope to represent.
 *
 * No endpoint accepts a pro id from the client. If one ever needs to, the
 * check is that the id equals `context.user.id`, not that it is well-formed.
 */
export interface RequestUser {
  id: string;
  email: string;
  name?: string;
  roles: string[];
  [key: string]: unknown;
}

export interface EndpointContext {
  user: RequestUser;
  requestId: string;
}

export interface EndpointDef<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny> {
  description: string;
  authenticated: boolean;
  inputSchema: TInput;
  outputSchema: TOutput;
  execute: (args: { input: z.infer<TInput>; context: EndpointContext }) => Promise<z.infer<TOutput>>;
}

export function createEndpoint<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
  def: EndpointDef<TInput, TOutput>,
): EndpointDef<TInput, TOutput> {
  return def;
}

export type AnyEndpoint = EndpointDef<z.ZodTypeAny, z.ZodTypeAny>;
