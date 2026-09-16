import type {
  FileListResponse,
  FileObject,
  FileSourceSelection,
  R2Lane,
} from "../../types/api";

// ---------------------------------------------------------------------------
// Pure file-management helpers shared by FilesPage and unit tests.
// Keep these functions independent of React state and hooks.
// ---------------------------------------------------------------------------

export type UploadMode = "file" | "text";
export type SelectedAction = null | "chat" | "upload";
export type PendingDelete = { type: "selected" } | { type: "single"; file: FileObject };

export interface UploadResponse {
  ok?: boolean;
  file?: FileObject;
}

export const TEXT_CHAT_SUFFIXES = new Set([
  ".txt",
  ".md",
  ".log",
  ".json",
  ".jsonl",
  ".csv",
  ".tsv",
  ".html",
  ".htm",
  ".xml",
  ".rss",
  ".pdf",
  ".docx",
  ".xlsx",
  ".yaml",
  ".yml",
  ".py",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".css",
  ".sql",
  ".sh",
  ".toml",
  ".ini",
  ".cfg",
]);

export const MAX_SELECTED_OBJECTS = 8;

export function fileKey(file: FileObject): string {
  return String(file.object_key || file.key || "");
}

export function fileName(file: FileObject): string {
  const key = fileKey(file);
  return String(
    file.filename ||
      file.original_name ||
      key.split("/").pop() ||
      key ||
      "Unnamed file",
  );
}

export function extension(name: string): string {
  const lower = name.toLowerCase();
  const index = lower.lastIndexOf(".");
  return index >= 0 ? lower.slice(index) : "";
}

export function canChatWithObject(file: FileObject): boolean {
  const contentType = String(file.content_type || "").toLowerCase();
  return (
    TEXT_CHAT_SUFFIXES.has(extension(fileName(file))) ||
    contentType.startsWith("text/") ||
    ["json", "xml", "csv", "pdf", "wordprocessingml", "spreadsheetml"].some(
      (token) => contentType.includes(token),
    )
  );
}

export function responseMessage(response: FileListResponse): string {
  if (typeof response.error === "string") return response.error;
  if (response.error?.message) return response.error.message;
  return response.message || "File listing failed.";
}

export function laneLabel(lane: R2Lane): string {
  return lane.lane
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function laneStatus(lane: R2Lane): { status: string; label: string } {
  if (lane.writable) return { status: "active", label: "Read/write" };
  if (lane.readable) return { status: "readonly", label: "Read-only" };
  if (lane.configured) return { status: "warning", label: "Registry only" };
  return { status: "unknown", label: "Unavailable" };
}

export function rootPrefixForLane(lane: R2Lane | undefined): string {
  return lane?.primary_upload_lane ? "uploads/" : "";
}

export function selectionId(lane: string, key: string): string {
  return `${lane}::${key}`;
}

export function selectedSourceForFile(
  lane: string,
  file: FileObject,
): FileSourceSelection {
  return { lane, object_key: fileKey(file), name: fileName(file) };
}
