import { describe, expect, test } from "bun:test";
import { loadConfig } from "@/config";
import { ConfigError } from "@driversim/core";

const JWKS = JSON.stringify({ keys: [] });

describe("loadConfig", () => {
  test("applies defaults and derives service-scoped names", () => {
    const config = loadConfig({ AUTH_JWKS_JSON: JWKS, SERVICE_NAME: "student-service" });
    expect(config.app.env).toBe("development");
    expect(config.http.port).toBeGreaterThan(1023);
    expect(config.redis.keyPrefix).toBe("student-service:");
    expect(config.kafka.consumerGroup).toBe("student-service");
    expect(config.database.url).toBeUndefined();
  });

  test("requires a token verification source", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  test("production refuses in-memory fallbacks and lists every problem", () => {
    try {
      loadConfig({ NODE_ENV: "production", AUTH_JWKS_JSON: JWKS });
      throw new Error("expected ConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const issues = (error as ConfigError).issues.join("\n");
      for (const key of ["DATABASE_URL", "REDIS_URL", "KAFKA_BROKERS", "AUTH_JWKS_URL"])
        expect(issues).toContain(key);
    }
  });

  test("never echoes secret values in errors", () => {
    try {
      loadConfig({ AUTH_JWKS_JSON: JWKS, DATABASE_URL: "not a url with s3cr3t" });
    } catch (error) {
      expect((error as Error).message).not.toContain("s3cr3t");
      return;
    }
    throw new Error("expected ConfigError");
  });

  test("blank optional values (as in .env.example) count as unset", () => {
    const config = loadConfig({
      AUTH_JWKS_JSON: JWKS,
      KAFKA_SASL_MECHANISM: "",
      REDIS_URL: "",
      DATABASE_URL: "",
    });
    expect(config.kafka.sasl).toBeUndefined();
    expect(config.redis.url).toBeUndefined();
  });
});
