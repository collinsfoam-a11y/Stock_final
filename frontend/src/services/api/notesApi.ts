import apiClient from "../httpClient";

export interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at?: string | null;
  created_by: string;
}

export interface NotesListResponse {
  success: boolean;
  data: Note[];
  pagination?: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
  error?: unknown;
}

export interface NoteCreateRequest {
  title: string;
  content: string;
}

export interface NoteCreateResponse {
  success: boolean;
  data: Note;
  error?: unknown;
}

export async function listNotes(params?: {
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const res = await apiClient.get<NotesListResponse>("/api/notes", {
    params: {
      q: params?.q,
      page: params?.page,
      page_size: params?.pageSize,
    },
  });
  return res.data;
}

export async function createNote(note: NoteCreateRequest) {
  const res = await apiClient.post<NoteCreateResponse>("/api/notes", note);
  return res.data;
}

export async function updateNote(): Promise<never> {
  throw new Error("Notes update is not supported by this backend");
}

export async function deleteNote(id: string) {
  const res = await apiClient.delete(`/api/notes/${id}`);
  return res.data;
}
