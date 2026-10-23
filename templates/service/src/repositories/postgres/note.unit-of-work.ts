import type {
  INoteRepository,
  INoteUnitOfWork,
  NoteTransactionScope,
} from "@/interfaces/note/repository.interface";
import { PostgresOutboxWriter } from "@driversim/messaging";
import type { SQL } from "bun";
import { PostgresNoteRepository } from "./note.repository";

/** Note changes and their outbox events commit in the same Postgres transaction. */
export class PostgresNoteUnitOfWork implements INoteUnitOfWork {
  readonly notes: INoteRepository;

  constructor(private readonly sql: SQL) {
    this.notes = new PostgresNoteRepository(sql);
  }

  async run<T>(work: (scope: NoteTransactionScope) => Promise<T>): Promise<T> {
    return (await this.sql.begin((tx) =>
      work({ notes: new PostgresNoteRepository(tx), outbox: new PostgresOutboxWriter(tx) }),
    )) as T;
  }
}
