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
