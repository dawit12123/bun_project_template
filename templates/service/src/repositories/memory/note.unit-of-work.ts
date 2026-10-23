import type { NoteSnapshot } from "@/interfaces/note/note.interface";
import type { INoteUnitOfWork, NoteTransactionScope } from "@/interfaces/note/repository.interface";
import type { MemoryOutbox } from "@driversim/messaging";
import { MemoryNoteRepository } from "./note.repository";

/**
 * In-memory unit of work with real rollback semantics: rows are restored and staged events
 * discarded when the work throws, mirroring the Postgres transaction behaviour.
 */
export class MemoryNoteUnitOfWork implements INoteUnitOfWork {
  readonly notes: MemoryNoteRepository;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly outbox: MemoryOutbox,
    rows: Map<string, NoteSnapshot> = new Map(),
  ) {
    this.notes = new MemoryNoteRepository(rows);
  }

  /** Serialized like a SERIALIZABLE transaction; good enough for tests and local development. */
  run<T>(work: (scope: NoteTransactionScope) => Promise<T>): Promise<T> {
    const execute = async (): Promise<T> => {
      const backup = new Map(this.notes.rows);
      const writer = this.outbox.stagingWriter();
      try {
        const result = await work({ notes: this.notes, outbox: writer });
        this.outbox.append(writer.staged);
        return result;
      } catch (error) {
        this.notes.rows.clear();
        for (const [id, row] of backup) this.notes.rows.set(id, row);
        throw error;
      }
    };
    const next = this.#queue.then(execute, execute);
    this.#queue = next.catch(() => undefined);
    return next;
  }
}
