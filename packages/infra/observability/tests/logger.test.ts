import { describe, expect, test } from "bun:test";
import { REDACTED_PLACEHOLDER } from "@driversim/core";
import { createCaptureLogger } from "@driversim/testing";
import { createJsonLogger } from "../src/logger/json.logger";

describe("json logger", () => {
  test("redacts secrets at any depth and in any key style", () => {
    const { logger, lines } = createCaptureLogger();
    logger.info("login", {
      phone: "+251911234567",
      password: "hunter2",
      body: { refresh_token: "rt-123", nested: { "X-Api-Key": "k-1", otpCode: "730519" } },
      headers: { Authorization: "Bearer abc" },
    });
    const line = lines[0] ?? "";
    for (const secret of ["hunter2", "rt-123", "k-1", "730519", "Bearer abc"])
      expect(line).not.toContain(secret);
    expect(line).toContain(REDACTED_PLACEHOLDER);
    expect(line).toContain("+251911234567");
  });

  test("redacts service-specific extra keys", () => {
    const lines: string[] = [];
    const logger = createJsonLogger({
      level: "info",
      extraRedactKeys: ["national_id"],
      sink: (line) => lines.push(line),
    });
    logger.info("kyc", { nationalId: "ET-998877" });
    expect(lines[0]).not.toContain("ET-998877");
  });

  test("respects the level threshold and child bindings", () => {
    const { logger, records } = createCaptureLogger("info");
    logger.debug("hidden");
    logger.child({ requestId: "r-1" }).warn("shown");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ level: "warn", msg: "shown", requestId: "r-1" });
  });

  test("serializes errors and survives circular structures", () => {
    const { logger, records } = createCaptureLogger();
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    logger.error("boom", { err: new Error("bad", { cause: new Error("root") }), circular });
    const record = records[0] as Record<string, any>;
    expect(record.err.message).toBe("bad");
    expect(record.err.cause.message).toBe("root");
    expect(record.circular.self).toBe("[Circular]");
  });
});
