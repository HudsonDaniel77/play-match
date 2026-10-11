export interface CursorPaginatedResponse<T> {
  entries?: T[];
  items?: T[];
  games?: T[];
  notifications?: T[];
  nextCursor?: string | null;
  hasMore?: boolean;
}

/**
 * Returns the next cursor parameter or undefined when no more pages exist.
 */
export function getNextCursorParam<T>(
  lastPage: CursorPaginatedResponse<T>,
): string | undefined {
  if (!lastPage || lastPage.hasMore === false || !lastPage.nextCursor) {
    return undefined;
  }
  return lastPage.nextCursor;
}
