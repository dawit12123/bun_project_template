import { NOTE_TOPIC } from "@/constants/note.constants";
import type { CreateNoteRequestDto, ListNotesQueryDto, UpdateNoteRequestDto } from "@/dto/note/request.dto";
import type { NoteResponseDto } from "@/dto/note/response.dto";
import { NoteErrors } from "@/errors/note.errors";
import type { INoteUnitOfWork } from "@/interfaces/note/repository.interface";
import type { INoteService } from "@/interfaces/note/service.interface";
import { NoteMapper } from "@/mappers/note.mapper";
import { Note } from "@/models/note.model";
import { toOutboundMessages } from "@driversim/core";
import type { Clock, IdGenerator } from "@driversim/core";
import type { ActionContext } from "@driversim/core";
import type { Page } from "@driversim/core";
import type { OutboxWriter } from "@driversim/core";

export interface NoteServiceDependencies {
  unitOfWork: INoteUnitOfWork;
  clock: Clock;
  newId: IdGenerator;
  /** Service name stamped on outgoing events as `source`. */
  serviceName: string;
}

/**
 * EXAMPLE DOMAIN use cases. Depends only on ports (interfaces), never on adapters, so it runs
 * identically against Postgres or the in-memory adapters.
 */
export class NoteService implements INoteService {
  constructor(private readonly deps: NoteServiceDependencies) {}

  async create(
    context: ActionContext,
    schoolId: string,
    input: CreateNoteRequestDto,
  ): Promise<NoteResponseDto> {
    const note = Note.create(
      {
        id: this.deps.newId(),
        schoolId,
        title: input.title,
        body: input.body,
        createdBy: context.actor.userId,
      },
      this.deps.clock.now(),
    );
    await this.deps.unitOfWork.run(async ({ notes, outbox }) => {
      await notes.insert(note);
      await this.#publish(outbox, note, context);
    });
    return NoteMapper.toResponse(note);
  }

  async get(schoolId: string, noteId: string): Promise<NoteResponseDto> {
    const note = await this.deps.unitOfWork.notes.findById(schoolId, noteId);
    if (!note) throw NoteErrors.notFound();
    return NoteMapper.toResponse(note);
  }

  async list(schoolId: string, query: ListNotesQueryDto): Promise<Page<NoteResponseDto>> {
    const page = await this.deps.unitOfWork.notes.list(
      { schoolId, createdBy: query.createdBy },
      { limit: query.limit, cursor: query.cursor },
    );
    return { ...page, items: page.items.map(NoteMapper.toResponse) };
  }

  async update(
    context: ActionContext,
    schoolId: string,
    noteId: string,
    input: UpdateNoteRequestDto,
  ): Promise<NoteResponseDto> {
    return this.deps.unitOfWork.run(async ({ notes, outbox }) => {
      const note = await notes.findById(schoolId, noteId);
      if (!note) throw NoteErrors.notFound();
      if (note.version !== input.version) throw NoteErrors.versionConflict(input.version);

      const changed = note.update(
        { title: input.title, body: input.body },
        context.actor.userId,
        this.deps.clock.now(),
      );
      if (!changed) return NoteMapper.toResponse(note);

      if (!(await notes.update(note, input.version))) throw NoteErrors.versionConflict(input.version);
      await this.#publish(outbox, note, context);
      return NoteMapper.toResponse(note);
    });
  }

  async delete(
    context: ActionContext,
    schoolId: string,
    noteId: string,
    expectedVersion?: number,
  ): Promise<void> {
    await this.deps.unitOfWork.run(async ({ notes, outbox }) => {
      const note = await notes.findById(schoolId, noteId);
      if (!note) throw NoteErrors.notFound();
      if (expectedVersion !== undefined && note.version !== expectedVersion) {
        throw NoteErrors.versionConflict(expectedVersion);
      }
      note.markDeleted(context.actor.userId, this.deps.clock.now());
      if (!(await notes.delete(schoolId, noteId))) throw NoteErrors.notFound();
      await this.#publish(outbox, note, context);
    });
  }

  async #publish(outbox: OutboxWriter, note: Note, context: ActionContext): Promise<void> {
    const messages = toOutboundMessages(note.pullEvents(), {
      source: this.deps.serviceName,
      topic: NOTE_TOPIC,
      schoolId: note.schoolId,
      correlationId: context.correlationId,
    });
    for (const message of messages) await outbox.add(message);
  }
}
