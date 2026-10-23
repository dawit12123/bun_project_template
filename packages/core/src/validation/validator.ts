import { z } from "zod";
import { Errors } from "../errors/error.factory";
import type { FieldIssue } from "../types/response.interface";

/** Ethiopian mobile numbers: 09xxxxxxxx / 07xxxxxxxx / +2519xxxxxxxx / 2517xxxxxxxx. */
const ETHIOPIAN_MOBILE_PATTERN = /^(?:\+?251|0)([79]\d{8})$/;

// ── Reusable field validators ────────────────────────────────────────────────

export const uuidField = () => z.string().uuid({ message: "Must be a valid UUID." });

export const trimmedString = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, { message: min <= 1 ? "Is required." : `Must be at least ${min} characters.` })
    .max(max, { message: `Must be at most ${max} characters.` });

/** Lower-cased, trimmed e-mail address. */
export const emailField = () =>
  z.string().trim().toLowerCase().max(254).email({ message: "Must be a valid e-mail address." });

/** Ethiopian mobile number normalized to E.164 (+251XXXXXXXXX). */
export const ethiopianPhoneField = () =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s-]/g, ""))
    .refine((value) => ETHIOPIAN_MOBILE_PATTERN.test(value), {
      message: "Must be a valid Ethiopian mobile number.",
    })
    .transform((value) => `+251${value.replace(ETHIOPIAN_MOBILE_PATTERN, "$1")}`);

export const isoDateTimeField = () => z.string().datetime({ offset: true });

// ── Validation helpers ───────────────────────────────────────────────────────

export const zodIssuesToFieldIssues = (error: z.ZodError, prefix?: string): FieldIssue[] =>
  error.issues.map((issue) => ({
    path: [prefix, ...issue.path].filter((part) => part !== undefined && part !== "").join("."),
    message: issue.message,
    code: issue.code,
  }));

/**
 * Validates input outside the HTTP layer (consumers, scripts, services).
 * Throws a VALIDATION_FAILED AppError carrying field-level issues.
 */
export const validateWith = <S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  prefix?: string,
): z.output<S> => {
  const result = schema.safeParse(input);
  if (!result.success) throw Errors.validation(zodIssuesToFieldIssues(result.error, prefix));
  return result.data;
};
