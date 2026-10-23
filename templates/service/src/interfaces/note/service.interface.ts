import type { CreateNoteRequestDto, ListNotesQueryDto, UpdateNoteRequestDto } from "@/dto/note/request.dto";
import type { NoteResponseDto } from "@/dto/note/response.dto";
import type { ActionContext } from "@driversim/core";
import type { Page } from "@driversim/core";

/** Inbound port — the use cases of the note domain, consumed by controllers and consumers. */
export interface INoteService {
  create(context: ActionContext, schoolId: string, input: CreateNoteRequestDto): Promise<NoteResponseDto>;
  get(schoolId: string, noteId: string): Promise<NoteResponseDto>;
  list(schoolId: string, query: ListNotesQueryDto): Promise<Page<NoteResponseDto>>;
  update(
    context: ActionContext,
    schoolId: string,
    noteId: string,
    input: UpdateNoteRequestDto,
  ): Promise<NoteResponseDto>;
  delete(context: ActionContext, schoolId: string, noteId: string, expectedVersion?: number): Promise<void>;
}
