/**
 * Field names whose values must never reach logs. Matching is case-insensitive and
 * ignores separators, so `refresh_token`, `refreshToken` and `Refresh-Token` all match.
 */
export const REDACTED_FIELD_NAMES: readonly string[] = [
  "password",
  "passwordhash",
  "currentpassword",
  "newpassword",
  "oldpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "invitetoken",
  "otp",
  "otpcode",
  "verificationcode",
  "mfacode",
  "secret",
  "clientsecret",
  "apikey",
  "xapikey",
  "authorization",
  "cookie",
  "setcookie",
  "privatekey",
  "pin",
];

export const REDACTED_PLACEHOLDER = "[REDACTED]";

/** Inbound request/correlation IDs are only trusted when they match this shape. */
export const TRACE_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
