export const MAX_ATTACHMENT_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENT_FILE_COUNT = 10;
export const MAX_ATTACHMENT_TOTAL_BYTES = 100 * 1024 * 1024;
export const MAX_ATTACHMENT_FILE_NAME_LENGTH = 120;
export const MAX_OBJECT_AUTHORIZATION_SECONDS = 30 * 60;

export type AttachmentValidationErrorCode =
  | "INVALID_FILE_NAME"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TYPE_MISMATCH"
  | "INVALID_FILE_SIZE"
  | "FILE_TOO_LARGE";

export class AttachmentValidationError extends Error {
  constructor(readonly code: AttachmentValidationErrorCode) {
    super(code);
  }
}

export type ObjectStorageErrorCode =
  | "INVALID_OBJECT_KEY"
  | "INVALID_AUTHORIZATION_TTL"
  | "INVALID_DOWNLOAD_FILE_NAME"
  | "OBJECT_STORAGE_UNAVAILABLE";

export class ObjectStorageError extends Error {
  constructor(readonly code: ObjectStorageErrorCode) {
    super(code);
  }
}

export interface AttachmentFileCandidate {
  fileName: string;
  declaredMediaType: string;
  detectedMediaType: string;
  sizeBytes: number;
}

export interface ValidatedAttachmentFile {
  normalizedFileName: string;
  mediaType: string;
  sizeBytes: number;
}

export interface UploadAuthorization {
  method: "PUT";
  url: string;
  requiredHeaders: Readonly<Record<string, string>>;
  expiresAt: string;
}

export interface DownloadAuthorization {
  method: "GET";
  url: string;
  expiresAt: string;
}

export interface StoredObjectMetadata {
  objectKey: string;
  sizeBytes: number;
  mediaType: string;
  etag: string | null;
  versionId: string | null;
}

export interface PrivateObjectStorage {
  authorizeUpload(input: {
    objectKey: string;
    mediaType: string;
    expiresInSeconds: number;
  }): Promise<UploadAuthorization>;
  authorizeDownload(input: {
    objectKey: string;
    downloadFileName: string;
    expiresInSeconds: number;
  }): Promise<DownloadAuthorization>;
  statObject(objectKey: string): Promise<StoredObjectMetadata | null>;
  readObjectBytes(objectKey: string, maxBytes: number): Promise<Uint8Array>;
  deleteObject(objectKey: string): Promise<void>;
}
