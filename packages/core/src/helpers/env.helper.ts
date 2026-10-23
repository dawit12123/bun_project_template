import { z } from "zod";

const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off"]);

/** Boolean env flag accepting true/false, 1/0, yes/no, on/off. */
export const booleanFlag = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value.trim() === "") return defaultValue;
      const normalized = value.trim().toLowerCase();
      if (TRUE_VALUES.has(normalized)) return true;
      if (FALSE_VALUES.has(normalized)) return false;
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be a boolean (true/false)" });
      return z.NEVER;
    });

/** Comma-separated list, trimmed, empty entries removed. */
export const csvList = () =>
  z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );

/** Optional string where blank values count as unset. */
export const optionalString = () =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.trim() === "" ? undefined : value.trim()));

export class ConfigError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid configuration:\n  - ${issues.join("\n  - ")}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

/** Formats zod issues by variable name only — values are never echoed (they may be secrets). */
export const formatEnvIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
