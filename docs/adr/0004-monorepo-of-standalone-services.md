# ADR-0004: Monorepo of independently deployable services

- **Status:** accepted (2026-10-23), amended by ADR-0005
- **Context:** Several services (auth, student, school, scheduling, exams, …) must look and
  behave the same, yet each must deploy and evolve independently.
- **Decision:** One Bun-workspaces monorepo. `templates/service` is the blueprint, and
  `bun run new-service` copies it into `services/<name>`. Services never import each other.
  Each owns its config, migrations, database and Docker image.
- **Consequences:** Consistency comes from the template plus the shared platform packages
  (ADR-0005). CI checks only the workspaces a change touches (all of them when `packages/`
  changes).
