import { POSTGRES_ERROR_CODES } from "./constants/database.constants";

interface PostgresErrorLike {
  errno?: unknown;
  code?: unknown;
  constraint?: unknown;
}

/** SQLSTATE of a driver error (Bun exposes it as `errno`; other drivers as `code`). */
export const sqlState = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const { errno, code } = error as PostgresErrorLike;
  if (typeof errno === "string" && /^[0-9A-Z]{5}$/.test(errno)) return errno;
  if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  return undefined;
};

const constraintOf = (error: unknown): string | undefined => {
  const constraint = (error as PostgresErrorLike | null)?.constraint;
  return typeof constraint === "string" ? constraint : undefined;
};

export const isUniqueViolation = (error: unknown, constraint?: string): boolean =>
  sqlState(error) === POSTGRES_ERROR_CODES.UNIQUE_VIOLATION &&
  (constraint === undefined || constraintOf(error) === constraint);

export const isForeignKeyViolation = (error: unknown): boolean =>
  sqlState(error) === POSTGRES_ERROR_CODES.FOREIGN_KEY_VIOLATION;
