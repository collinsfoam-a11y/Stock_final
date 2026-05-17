import {
  createNote,
  deleteNote as deleteNoteById,
  listNotes,
  type Note as ApiNote,
  type NoteCreateRequest,
} from "./api/notesApi";

/** Legacy note type kept for compatibility with existing callers. */
export interface Note {
  id?: string;
  content: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

/** Note response from API */
interface NotesResponse {
  notes: Note[];
}

/** API operation result */
interface ApiResult {
  success: boolean;
  message?: string;
}

const buildTitle = (content: string) => {
  const normalized = content.replace(/\s+/g, " ").trim();
  return (normalized.slice(0, 80) || "Note").slice(0, 200);
};

const toApiNote = (sessionId: string, note: Omit<Note, "id">): NoteCreateRequest => {
  const content = sessionId ? `[${sessionId}] ${note.content}` : note.content;
  return { title: buildTitle(content), content };
};

const fromApiNote = (note: ApiNote): Note => ({
  id: note.id,
  content: note.content,
  created_at: note.created_at,
  updated_at: note.updated_at ?? undefined,
  created_by: note.created_by,
});

// Notes API service
export const NotesAPI = {
  getNotes: async (sessionId: string): Promise<NotesResponse> => {
    const data = await listNotes({ q: sessionId, page: 1, pageSize: 200 });
    const source = Array.isArray(data?.data) ? data.data : [];
    return { notes: source.map(fromApiNote) };
  },

  addNote: async (
    sessionId: string,
    note: Omit<Note, "id">,
  ): Promise<ApiResult> => {
    await createNote(toApiNote(sessionId, note));
    return { success: true };
  },

  updateNote: async (
    _noteId: string,
    _note: Partial<Note>,
  ): Promise<ApiResult> => {
    return { success: false, message: "Notes update is not supported" };
  },

  deleteNote: async (noteId: string): Promise<ApiResult> => {
    await deleteNoteById(noteId);
    return { success: true };
  },
};
