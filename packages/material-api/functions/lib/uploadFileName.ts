const ALLOWED_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".pdf",
  ".txt",
  ".doc",
  ".docx",
  ".mp4",
  ".mov",
]);

const MAX_FILE_NAME_LENGTH = 180;

export type UploadFileNameResult =
  | { ok: true; fileName: string }
  | { ok: false; message: string };

/**
 * Flat basename for `materials/{uuid}-{fileName}` and `practice/{uuid}-{fileName}`.
 * Strips path segments, `..` and control characters so the key still passes
 * the download allowlist in getDownloadUrls.ts.
 */
export function rejectedUploadFileName(
  result: UploadFileNameResult
): result is { ok: false; message: string } {
  return result.ok === false;
}

export function sanitizeUploadFileName(raw: unknown): UploadFileNameResult {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, message: "fileName is required." };
  }

  let name = raw.trim().replace(/[\u0000-\u001F\u007F]/g, "");
  name = name.replace(/\.\./g, "").replace(/[/\\]/g, "").trim();

  if (!name || name === "." || name.length > MAX_FILE_NAME_LENGTH) {
    return { ok: false, message: "Ogiltigt filnamn." };
  }

  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot).toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, message: "Otillåten filtyp" };
  }

  return { ok: true, fileName: name };
}
