// Helpers for <QueryError>: which query failed, and what to say about it.

/** The part of a TanStack Query result this needs. */
export interface FailableQuery {
  error: unknown
  refetch: () => unknown
}

/**
 * The first of the given queries that failed, with a retry that refetches all
 * of the failed ones. Null when none failed.
 */
export function firstFailedQuery(queries: FailableQuery[]): { error: unknown; retry: () => Promise<void> } | null {
  const failed = queries.filter((q) => q.error)
  if (failed.length === 0) return null
  return {
    error: failed[0].error,
    retry: async () => {
      await Promise.all(failed.map((q) => q.refetch()))
    },
  }
}

/** A readable message for a Supabase/PostgREST or network error. */
export function describeQueryError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'The request failed.'
}
