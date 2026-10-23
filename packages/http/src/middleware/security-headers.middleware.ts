import { secureHeaders } from "hono/secure-headers";

/** Hardened defaults for a JSON API (no inline content is ever served except Swagger UI). */
export const securityHeaders = () =>
  secureHeaders({
    strictTransportSecurity: "max-age=31536000; includeSubDomains",
    xFrameOptions: "DENY",
    referrerPolicy: "no-referrer",
    crossOriginResourcePolicy: "same-site",
  });
