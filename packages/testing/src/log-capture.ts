import type { LogRecord, LogSink, Logger } from "@driversim/core";
import { createJsonLogger } from "@driversim/observability";

/** Logger that keeps records in memory so tests can assert on (redacted) output. */
export const createCaptureLogger = (level: "trace" | "debug" | "info" = "debug") => {
  const records: LogRecord[] = [];
  const lines: string[] = [];
  /** Pass to `createRuntime({ log: { sink } })` to capture a service runtime's logs. */
  const sink: LogSink = (line, record) => {
    lines.push(line);
    records.push(record);
  };
  const logger: Logger = createJsonLogger({ level, sink });
  return { logger, sink, records, lines };
};
