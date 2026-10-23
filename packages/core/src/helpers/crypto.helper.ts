import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** URL-safe random token, e.g. for refresh or invitation tokens. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

export const hmacSha256Hex = (secret: string, value: string): string =>
  createHmac("sha256", secret).update(value).digest("hex");

/** Constant-time comparison that does not leak length differences. */
export const safeEqual = (a: string, b: string): boolean =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/** Uniformly distributed numeric code (OTP), preserving leading zeros. */
export const randomNumericCode = (digits = 6): string => {
  if (!Number.isInteger(digits) || digits < 4 || digits > 10) {
    throw new RangeError("digits must be an integer between 4 and 10");
  }
  let code = "";
  for (let index = 0; index < digits; index += 1) code += String(randomInt(0, 10));
  return code;
};
