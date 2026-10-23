import type { LogRecord, Logger } from "@driversim/core";
import { createJsonLogger } from "@driversim/observability";

/** Logger that keeps records in memory so tests can assert on (redacted) output. */
export const createCaptureLogger = (level: "trace" | "debug" | "info" = "debug") => {
  const records: LogRecord[] = [];
  const lines: string[] = [];
  const logger: Logger = createJsonLogger({
    level,
    sink: (line, record) => {
      lines.push(line);
      records.push(record);
    },
  });
  return { logger, records, lines };
};
