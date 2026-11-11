import {
  AttachmentValidationError,
  MAX_ATTACHMENT_FILE_BYTES,
  MAX_ATTACHMENT_FILE_NAME_LENGTH,
  type AttachmentFileCandidate,
  type ValidatedAttachmentFile,
} from "./contracts.js";

const approvedMediaTypeByExtension: ReadonlyMap<string, string> = new Map([
  ["pdf", "application/pdf"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
]);

export function validateAttachmentFile(
  candidate: AttachmentFileCandidate,
): ValidatedAttachmentFile {
  const normalizedFileName = candidate.fileName.normalize("NFKC").trim();
  if (
    normalizedFileName.length === 0 ||
    normalizedFileName.length > MAX_ATTACHMENT_FILE_NAME_LENGTH ||
    normalizedFileName.startsWith(".") ||
    /[\\/]/u.test(normalizedFileName) ||
    [...normalizedFileName].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    throw new AttachmentValidationError("INVALID_FILE_NAME");
  }
  if (!Number.isSafeInteger(candidate.sizeBytes) || candidate.sizeBytes <= 0) {
    throw new AttachmentValidationError("INVALID_FILE_SIZE");
  }
  if (candidate.sizeBytes > MAX_ATTACHMENT_FILE_BYTES) {
    throw new AttachmentValidationError("FILE_TOO_LARGE");
  }

  const extension = normalizedFileName.split(".").at(-1)?.toLowerCase() ?? "";
  const approvedMediaType = approvedMediaTypeByExtension.get(extension);
  if (!approvedMediaType) {
    throw new AttachmentValidationError("UNSUPPORTED_FILE_TYPE");
  }
  const declaredMediaType = candidate.declaredMediaType.trim().toLowerCase();
  const detectedMediaType = candidate.detectedMediaType.trim().toLowerCase();
  if (declaredMediaType !== approvedMediaType || detectedMediaType !== approvedMediaType) {
    throw new AttachmentValidationError("FILE_TYPE_MISMATCH");
  }

  return {
    normalizedFileName,
    mediaType: approvedMediaType,
    sizeBytes: candidate.sizeBytes,
  };
}
