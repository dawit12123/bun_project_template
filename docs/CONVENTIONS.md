# Conventions

## Naming

| Item | Convention | Example |
|---|---|---|
| Files | `<domain>.<kind>.ts`, kebab-case | `student.service.ts`, `student-document.model.ts` |
| DTO folder | `dto/<domain>/request.dto.ts · response.dto.ts · validator.ts` | `dto/student/request.dto.ts` |
| Ports | `I<Name>` in `interfaces/<domain>/` | `IStudentRepository`, `IStudentService` |
| Zod schemas / DTO types | `createStudentRequestSchema` / `CreateStudentRequestDto` | |
| Permissions | `<resource>:<action>[:<scope>]` | `students:read`, `students:documents:verify` |
| Events | `<domain>.<entity>.<past-tense>` + integer `version` | `student.registered` v1 |
| Topics | `driversim.<bounded-context>.events.v<major>` | `driversim.students.events.v1` |
| Schemas | service name in snake_case | `student_service` |
| Tables | snake_case plural; ids are UUIDv7; unqualified in service code, qualified in migrations | `student_service.students` |
| Migrations | `database/migrations/NNNN_<schema>__<change>.up.sql` + `.down.sql`, one schema per file, never edited after merge | `0007_student_service__documents.up.sql` |
| Cross-service reads | qualified name, read-only grant | `select … from auth_service.users` |

## HTTP API

- Prefix every route with `/api/v1`. School-scoped resources live under `/schools/{schoolId}/…`
  and use `requireSchoolAccess`.
- **Success:** `{ "success": true, "data": …, "meta": { "requestId", "pagination?" } }`
- **Error:** `{ "success": false, "error": { "code", "message", "details?" }, "meta": { "requestId" } }`
- Clients branch on `error.code`, never on `message`:

| Code | HTTP | When |
|---|---|---|
| `BAD_REQUEST` | 400 | malformed JSON / request |
| `UNAUTHENTICATED` | 401 | missing/invalid/expired/revoked token |
| `FORBIDDEN` | 403 | authenticated but not allowed (permission, school) |
| `NOT_FOUND` | 404 | resource or route missing |
| `CONFLICT` | 409 | stale `version`, duplicate unique value |
| `PAYLOAD_TOO_LARGE` | 413 | body over `BODY_LIMIT_BYTES` |
| `VALIDATION_FAILED` | 422 | DTO/domain validation; `details[].path` like `body.title`, `query.cursor` |
| `RATE_LIMITED` | 429 | with `Retry-After` |
| `DEPENDENCY_UNAVAILABLE` | 503 | critical dependency down |
| `INTERNAL` | 500 | never exposes internals |

- Lists use cursor pagination: `?limit=1..100&cursor=…`, newest first.
- Updates use optimistic concurrency: send the `version` you read, and get 409 if it is stale.
- Send `X-Request-Id` / `X-Correlation-Id` (8–128 chars) to trace a flow. Both are echoed back.

## Validation layers

1. **DTO schemas** (`dto/<domain>/request.dto.ts`) validate shape and format at the edge (422).
2. **Validators** (`dto/<domain>/validator.ts`) apply the same rules for non-HTTP callers.
3. **Models/value objects** enforce business invariants (always, whoever calls).

## Events

- Envelope: `id, type, version, source, occurredAt, subject, schoolId, correlationId, causationId, data`.
- Additive changes keep the version. Breaking changes bump `version` and consumers handle both
  versions during the migration.
- Never publish directly from a service. Always go through the unit of work's `outbox`.
- Consumers must be idempotent (the inbox helps) and validate `data` with a schema in `dto/`.

## Logging & metrics

- Structured JSON, one line per record, `requestId` + `correlationId` on every request log.
- Secrets are redacted by key name (`password`, `token`, `otp`, `authorization`, …). Extend with
  `extraRedactKeys` for domain-specific PII. Never log OTPs, tokens or full documents.
- Metric labels use route templates (`/schools/:schoolId/…`), never raw ids.

## Security baseline

- Tokens: asymmetric algorithms only (EdDSA/ES256/RS256), issuer and audience required, short TTL.
- Authorization is server-side and permission-based. Role names alone grant nothing.
- Production config refuses in-memory adapters, inline JWKS and pretty logs.
- Credential-related endpoints use a dedicated rate limiter with `onStoreFailure: "closed"`.
