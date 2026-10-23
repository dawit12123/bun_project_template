import { Errors } from "../errors/error.factory";
import type { Page } from "../types/pagination.interface";

interface CursorPayload {
  /** Sort key of the last item on the previous page. */
  k: string;
}

export const encodeCursor = (key: string): string =>
  Buffer.from(JSON.stringify({ k: key } satisfies CursorPayload)).toString("base64url");

export const decodeCursor = (cursor: string | null | undefined): string | null => {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<CursorPayload>;
    if (typeof parsed.k !== "string" || parsed.k.length === 0) throw new Error("missing key");
    return parsed.k;
  } catch {
    throw Errors.validation([{ path: "query.cursor", message: "Cursor is invalid." }]);
  }
};

/** Builds a page from a `limit + 1` result set; the extra row signals that another page exists. */
export const toPage = <T>(rows: readonly T[], limit: number, keyOf: (item: T) => string): Page<T> => {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : [...rows];
  const last = items.at(-1);
  return { items, hasMore, nextCursor: hasMore && last !== undefined ? encodeCursor(keyOf(last)) : null };
};
