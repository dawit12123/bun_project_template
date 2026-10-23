import type { LogFields, LogLevel, LogRecord, LogSink, Logger } from "@driversim/core";
import { buildRedactionKeys, redact } from "./redact";

const LEVEL_WEIGHT: Record<LogLevel | "silent", number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Number.POSITIVE_INFINITY,
};

export interface JsonLoggerOptions {
  level: LogLevel | "silent";
  /** Human-readable single-line output for local development. */
  pretty?: boolean;
  base?: LogFields;
  sink?: LogSink;
  extraRedactKeys?: readonly string[];
}

const stdoutSink: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

const prettySink: LogSink = (_line, record) => {
  const { level, time, msg, ...rest } = record;
  const extras = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  process.stdout.write(`${time} ${level.toUpperCase().padEnd(5)} ${msg}${extras}\n`);
};

/** Structured JSON logger (one record per line) with mandatory secret redaction. */
export const createJsonLogger = (options: JsonLoggerOptions): Logger => {
  const threshold = LEVEL_WEIGHT[options.level];
  const sink = options.sink ?? (options.pretty ? prettySink : stdoutSink);
  const keys = buildRedactionKeys(options.extraRedactKeys);

  const build = (bindings: LogFields): Logger => {
    const write = (level: LogLevel, msg: string, fields?: LogFields) => {
      if (LEVEL_WEIGHT[level] < threshold) return;
      const record = redact(
        { level, time: new Date().toISOString(), msg, ...bindings, ...fields },
        keys,
      ) as LogRecord;
      sink(JSON.stringify(record), record);
    };

    return {
      trace: (msg, fields) => write("trace", msg, fields),
      debug: (msg, fields) => write("debug", msg, fields),
      info: (msg, fields) => write("info", msg, fields),
      warn: (msg, fields) => write("warn", msg, fields),
      error: (msg, fields) => write("error", msg, fields),
      fatal: (msg, fields) => write("fatal", msg, fields),
      child: (extra) => build({ ...bindings, ...extra }),
      isLevelEnabled: (level) => LEVEL_WEIGHT[level] >= threshold,
    };
  };

  return build(options.base ?? {});
};
