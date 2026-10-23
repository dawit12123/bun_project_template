/**
 * Runs work atomically. `TScope` exposes transaction-bound repositories and the outbox,
 * so a business change and its events either commit together or not at all.
 */
export interface UnitOfWork<TScope> {
  run<T>(work: (scope: TScope) => Promise<T>): Promise<T>;
}
