import { createHash } from "node:crypto";

import { fileTypeFromBuffer } from "file-type";

import { MAX_ATTACHMENT_FILE_BYTES } from "./contracts.js";
import type { PrivateObjectStorage } from "./contracts.js";
import type { AttachmentContentInspector } from "./attachment-service-contracts.js";

export class FileTypeAttachmentContentInspector implements AttachmentContentInspector {
  constructor(private readonly storage: PrivateObjectStorage) {}

  async inspectObject(objectKey: string): Promise<{ mediaType: string; sha256: string }> {
    const bytes = await this.storage.readObjectBytes(objectKey, MAX_ATTACHMENT_FILE_BYTES);
    return {
      mediaType: (await fileTypeFromBuffer(bytes))?.mime ?? "application/octet-stream",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
}
