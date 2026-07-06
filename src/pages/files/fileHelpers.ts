import type {
  FileListResponse,
  FileObject,
  FileSourceSelection,
  R2Lane,
  SkillItem,
  SkillListResponse,
} from "../../types/api";

// ---------------------------------------------------------------------------
// Pure helper functions extracted from src/pages/FilesPage.tsx (previously
// 2,190 lines in one file). These have no dependency on component state or
// React hooks, so they are safe to unit test directly and safe to reuse from
// any future split-out feature component (upload panel, browser, lane
// picker) without re-deriving the same logic.
//
// This is a source-preserving extraction: every function body below is
// unchanged from FilesPage.tsx. FilesPage.tsx now imports these instead of
// defining them inline.
// ---------------------------------------------------------------------------

export type UploadMode = "file" | "text";
export type SelectedAction =
  | null
  | "chat"
  | "apply_skill"
  | "create_skill"
  | "upload";
export type PendingDelete = { type: "selected" } | { type: "single"; file: FileObject };

export interface UploadResponse {
  ok?: boolean;
  file?: FileObject;
}

export interface SkillFromFileResponse {
  ok?: boolean;
  message?: string;
  error_code?: string;
}

export interface SkillRegistrationForm {
  title: string;
  description: string;
  repo: string;
  hiveLane: string;
  priorityTier: string;
  riskLevel: string;
  tags: string;
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

export function stripExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(0, index) : name;
}

export function defaultSkillForm(
  file: FileObject,
  lane: string,
): SkillRegistrationForm {
  const name = fileName(file);
  const cleanName = stripExtension(name)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    title: cleanName || name,
    description: `Use ${name} as a governed HIVE skill reference.`,
    repo: "HIVE",
    hiveLane: "uploaded-file-skills",
    priorityTier: "P2",
    riskLevel: "medium",
    tags: [
      "uploaded-file",
      lane || "uploads",
      extension(name).replace(/^\./, ""),
    ]
      .filter(Boolean)
      .join(", "),
  };
}

export function tagsFromInput(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function skillItems(response: SkillListResponse): SkillItem[] {
  return response.items ?? response.skills ?? response.results ?? [];
}

export function skillMetadata(skill: SkillItem): Record<string, unknown> {
  return typeof skill.metadata === "object" && skill.metadata !== null
    ? (skill.metadata as Record<string, unknown>)
    : {};
}

export function skillField(skill: SkillItem, key: string, fallback = ""): string {
  const direct = skill[key];
  if (direct != null && direct !== "")
    return Array.isArray(direct) ? direct.join(", ") : String(direct);
  const metadata = skillMetadata(skill);
  const nested = metadata[key];
  if (nested != null && nested !== "")
    return Array.isArray(nested) ? nested.join(", ") : String(nested);
  return fallback;
}

export function skillTitle(skill: SkillItem, index = 0): string {
  const metadata = skillMetadata(skill);
  return String(
    skill.title ||
      skill.name ||
      metadata.title ||
      metadata.name ||
      `Skill ${index + 1}`,
  );
}

export function skillIdentifier(skill: SkillItem, index = 0): string {
  const metadata = skillMetadata(skill);
  return String(
    skill.id ||
      skill.source_id ||
      metadata.skill_id ||
      metadata.reference_prefix ||
      skillTitle(skill, index),
  );
}

export function isHiveSkillsDescriptorFolder(
  lane: string,
  currentPrefix: string,
): boolean {
  const cleanLane = lane.trim().toLowerCase().replace(/-/g, "_");
  const cleanPrefix = currentPrefix.replace(/^\/+/, "");
  return cleanLane === "hive_skills" && cleanPrefix.startsWith("skills/");
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
