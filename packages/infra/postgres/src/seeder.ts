import type { Seed, SeedContext } from "./seed.interface";

/** Runs the seeds allowed for `environment`, in declaration order. Returns the names that ran. */
export const runSeeds = async (
  seeds: readonly Seed[],
  environment: string,
  context: SeedContext,
): Promise<string[]> => {
  const executed: string[] = [];
  for (const seed of seeds) {
    if (!seed.environments.includes(environment)) {
      context.logger.debug("seed skipped", { seed: seed.name, environment });
      continue;
    }
    await seed.run(context);
    executed.push(seed.name);
    context.logger.info("seed applied", { seed: seed.name });
  }
  return executed;
};
