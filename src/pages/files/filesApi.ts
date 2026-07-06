import { apiFetch } from "../../lib/api";
import type { UploadResponse } from "./fileHelpers";

// Extracted from FilesPage.tsx's uploadFiles()/uploadText() so the actual
// network-call contract (endpoint, query param, body shape) can be unit
// tested without mounting the full 2,190-line page component.

export function uploadSingleFile(file: File, lane: string): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("upload", file);
  const params = new URLSearchParams({ lane: lane || "uploads" });
  return apiFetch<UploadResponse>(`/v1/files/upload?${params.toString()}`, {
    method: "POST",
    body: formData,
  });
}

export function uploadTextFile(
  filename: string,
  content: string,
  lane: string,
): Promise<UploadResponse> {
  return apiFetch<UploadResponse>("/v1/files/upload-text", {
    method: "POST",
    body: JSON.stringify({
      filename,
      content,
      content_type: "text/plain; charset=utf-8",
      lane: lane || "uploads",
    }),
  });
}

// Extracted from FilesPage.tsx's useSelectedSkillWithFile(): builds the
// /chat navigation URL for the "review an existing skill, then apply it to
// this file" flow. Pure and therefore directly unit-testable, unlike the
// original which was buried inside a component closure over several pieces
// of page state.
export function buildSkillApplyChatUrl(params: {
  lane: string;
  fileKey: string;
  fileDisplayName: string;
  skillId: string;
  skillTitle: string;
}): string {
  const source = {
    lane: params.lane,
    object_key: params.fileKey,
    name: params.fileDisplayName,
  };
  const search = new URLSearchParams({
    lane: params.lane,
    file: params.fileKey,
    name: params.fileDisplayName,
    sources: JSON.stringify([source]),
    skill_id: params.skillId,
    skill_title: params.skillTitle,
    draft: `Use ${params.skillTitle} with this file: `,
  });
  return `/chat?${search.toString()}`;
}
