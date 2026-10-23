# syntax=docker/dockerfile:1.7
# Build from the REPOSITORY ROOT (the service depends on workspace packages):
#   docker build -f services/<name>/Dockerfile --build-arg SERVICE=services/<name> -t driversim/<name> .
ARG BUN_VERSION=1.2.21

FROM oven/bun:${BUN_VERSION}-alpine AS build
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:${BUN_VERSION}-alpine AS runtime
ARG SERVICE=templates/service
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /repo
COPY --from=build --chown=bun:bun /repo/node_modules ./node_modules
COPY --from=build --chown=bun:bun /repo/packages ./packages
COPY --from=build --chown=bun:bun /repo/${SERVICE} ./${SERVICE}
WORKDIR /repo/${SERVICE}
USER bun
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health/live" >/dev/null || exit 1
# Migrations run as a separate step/job:  docker run <image> bun scripts/migrate.ts up
CMD ["bun", "src/main.ts"]
