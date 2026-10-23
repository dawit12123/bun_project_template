export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LogFields = Record<string, unknown>;

export interface LogRecord extends LogFields {
  level: LogLevel;
  time: string;
  msg: string;
}

export type LogSink = (line: string, record: LogRecord) => void;

export interface Logger {
  trace(msg: string, fields?: LogFields): void;
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  fatal(msg: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
  isLevelEnabled(level: LogLevel): boolean;
}
