export interface PageRequest {
  limit: number;
  /** Opaque cursor returned by a previous page; absent for the first page. */
  cursor?: string | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
