import type { Clock } from "../types/clock.interface";

export const systemClock: Clock = { now: () => new Date() };

/** Deterministic clock for tests. */
export class ManualClock implements Clock {
  #current: number;

  constructor(start: Date | string = "2026-01-01T00:00:00.000Z") {
    this.#current = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.#current);
  }

  advance(milliseconds: number): void {
    this.#current += milliseconds;
  }

  set(date: Date | string): void {
    this.#current = new Date(date).getTime();
  }
}
