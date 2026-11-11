import { describe, expect, it } from "vitest";

import {
  AttachmentValidationError,
  MAX_ATTACHMENT_FILE_BYTES,
  validateAttachmentFile,
} from "../src/index.js";

describe("attachment file validation", () => {
  it.each([
    ["项目进展.pdf", "application/pdf"],
    ["项目进展.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["项目进展.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["项目进展.jpg", "image/jpeg"],
    ["项目进展.jpeg", "image/jpeg"],
    ["项目进展.png", "image/png"],
  ])("accepts approved type %s", (fileName, mediaType) => {
    expect(validateAttachmentFile({
      fileName,
      declaredMediaType: mediaType,
      detectedMediaType: mediaType,
      sizeBytes: MAX_ATTACHMENT_FILE_BYTES,
    })).toEqual({ normalizedFileName: fileName, mediaType, sizeBytes: MAX_ATTACHMENT_FILE_BYTES });
  });

  it.each([
    ["../进展.pdf", "application/pdf", "application/pdf", "INVALID_FILE_NAME"],
    ["进展.pdf.exe", "application/octet-stream", "application/octet-stream", "UNSUPPORTED_FILE_TYPE"],
    ["进展.svg", "image/svg+xml", "image/svg+xml", "UNSUPPORTED_FILE_TYPE"],
    ["进展.pdf", "application/pdf", "application/zip", "FILE_TYPE_MISMATCH"],
  ])("rejects unsafe candidate %s", (fileName, declaredMediaType, detectedMediaType, code) => {
    expect(() => validateAttachmentFile({
      fileName,
      declaredMediaType,
      detectedMediaType,
      sizeBytes: 1024,
    })).toThrow(expect.objectContaining({ code }));
  });

  it("rejects files above 20 MB", () => {
    expect(() => validateAttachmentFile({
      fileName: "进展.pdf",
      declaredMediaType: "application/pdf",
      detectedMediaType: "application/pdf",
      sizeBytes: MAX_ATTACHMENT_FILE_BYTES + 1,
    })).toThrow(new AttachmentValidationError("FILE_TOO_LARGE"));
  });
});
