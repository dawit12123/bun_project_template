import { describe, expect, test } from "bun:test";
import { ManualClock } from "@driversim/core";
import { MemoryKeyValueStore } from "../src/memory.store";
import { FixedWindowRateLimiter } from "../src/rate-limiter";

describe("MemoryKeyValueStore", () => {
  test("expires keys using the injected clock", async () => {
    const clock = new ManualClock();
    const store = new MemoryKeyValueStore(clock);
    await store.set("k", "v", 10);
    expect(await store.get("k")).toBe("v");
    clock.advance(10_001);
    expect(await store.get("k")).toBeNull();
  });

  test("setIfAbsent only writes once", async () => {
    const store = new MemoryKeyValueStore(new ManualClock());
    expect(await store.setIfAbsent("lock", "a", 5)).toBe(true);
    expect(await store.setIfAbsent("lock", "b", 5)).toBe(false);
    expect(await store.get("lock")).toBe("a");
  });

  test("increment keeps the TTL of the first increment", async () => {
    const clock = new ManualClock();
    const store = new MemoryKeyValueStore(clock);
    expect(await store.increment("c", 60)).toEqual({ value: 1, ttlSeconds: 60 });
    clock.advance(20_000);
    expect(await store.increment("c", 60)).toEqual({ value: 2, ttlSeconds: 40 });
  });
});

describe("FixedWindowRateLimiter", () => {
  test("allows up to the limit per window, then resets", async () => {
    const clock = new ManualClock();
    const limiter = new FixedWindowRateLimiter(new MemoryKeyValueStore(clock), {
      name: "login",
      limit: 2,
      windowSeconds: 60,
    });
    expect((await limiter.consume("ip-1")).allowed).toBe(true);
    expect(await limiter.consume("ip-1")).toMatchObject({ allowed: true, remaining: 0 });
    expect(await limiter.consume("ip-1")).toMatchObject({ allowed: false, remaining: 0 });
    expect((await limiter.consume("ip-2")).allowed).toBe(true);
    clock.advance(60_001);
    expect((await limiter.consume("ip-1")).allowed).toBe(true);
  });
});
