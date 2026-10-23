import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { AppError } from "../src/errors/app.error";
import { randomNumericCode, randomToken, safeEqual, sha256Hex } from "../src/helpers/crypto.helper";
import { booleanFlag, csvList } from "../src/helpers/env.helper";
import { isUuid, newId } from "../src/helpers/id.helper";
import { decodeCursor, encodeCursor, toPage } from "../src/helpers/pagination.helper";

describe("id.helper", () => {
  test("generates time-ordered UUIDv7 values", () => {
    const first = newId();
    const second = newId();
    expect(isUuid(first)).toBe(true);
    expect(first[14]).toBe("7");
    expect(first < second).toBe(true);
  });
});

describe("crypto.helper", () => {
  test("numeric codes have the requested length and keep leading zeros", () => {
    for (let index = 0; index < 200; index += 1) expect(randomNumericCode(6)).toMatch(/^\d{6}$/);
    expect(() => randomNumericCode(3)).toThrow(RangeError);
  });

  test("tokens are url-safe and unique", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
  });

  test("safeEqual compares regardless of length", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(sha256Hex("x")).toHaveLength(64);
  });
});

describe("pagination.helper", () => {
  test("cursor round-trips", () => {
    expect(decodeCursor(encodeCursor("key-1"))).toBe("key-1");
    expect(decodeCursor(undefined)).toBeNull();
  });

  test("tampered cursor is a validation error", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrow(AppError);
  });

  test("toPage uses the extra row to detect more pages", () => {
    const page = toPage(["a", "b", "c"], 2, (item) => item);
    expect(page.items).toEqual(["a", "b"]);
    expect(page.hasMore).toBe(true);
    expect(decodeCursor(page.nextCursor)).toBe("b");
    expect(toPage(["a"], 2, (item) => item)).toEqual({ items: ["a"], hasMore: false, nextCursor: null });
  });
});

describe("env.helper", () => {
  const schema = z.object({ FLAG: booleanFlag(false), LIST: csvList() });

  test("parses booleans and comma lists", () => {
    expect(schema.parse({ FLAG: "yes", LIST: " a, b ,,c " })).toEqual({ FLAG: true, LIST: ["a", "b", "c"] });
    expect(schema.parse({})).toEqual({ FLAG: false, LIST: [] });
  });

  test("rejects invalid booleans", () => {
    expect(schema.safeParse({ FLAG: "maybe" }).success).toBe(false);
  });
});
