import type { Seed } from "@driversim/postgres";
import { noteSeed } from "./note.seed"; // @example-domain

/** Seeds run in this order. Reference data first, demo data last. */
export const seeds: readonly Seed[] = [
  noteSeed, // @example-domain
];
