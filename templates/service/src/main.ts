import { bootstrap } from "@/bootstrap/bootstrap";
import { ConfigError } from "@driversim/core";

bootstrap().catch((error: unknown) => {
  // The logger may not exist yet (e.g. invalid config), so report on stderr as JSON.
  const payload =
    error instanceof ConfigError
      ? { level: "fatal", msg: "invalid configuration", issues: error.issues }
      : {
          level: "fatal",
          msg: "startup failed",
          error: error instanceof Error ? error.message : String(error),
        };
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), ...payload })}\n`);
  process.exit(1);
});
