import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  MAX_OBJECT_AUTHORIZATION_SECONDS,
  ObjectStorageError,
} from "./contracts.js";
import type {
  DownloadAuthorization,
  PrivateObjectStorage,
  StoredObjectMetadata,
  UploadAuthorization,
} from "./contracts.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OBJECT_KEY_PATTERN = /^projects\/([0-9a-f-]{36})\/assets\/([0-9a-f-]{36})$/iu;

export interface S3PrivateObjectStorageConfig {
  endpoint: string;
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  now?: () => Date;
}

export class S3PrivateObjectStorage implements PrivateObjectStorage {
  private readonly client: S3Client;
  private readonly publicClient: S3Client;
  private readonly now: () => Date;

  constructor(private readonly config: S3PrivateObjectStorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
    this.publicClient = new S3Client({
      endpoint: config.publicEndpoint ?? config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
    this.now = config.now ?? (() => new Date());
  }

  async authorizeUpload(input: {
    objectKey: string;
    mediaType: string;
    expiresInSeconds: number;
  }): Promise<UploadAuthorization> {
    requireObjectKey(input.objectKey);
    requireAuthorizationTtl(input.expiresInSeconds);
    try {
      const url = await getSignedUrl(
        this.publicClient,
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: input.objectKey,
          ContentType: input.mediaType,
        }),
        { expiresIn: input.expiresInSeconds },
      );
      return {
        method: "PUT",
        url,
        requiredHeaders: { "content-type": input.mediaType },
        expiresAt: expiresAt(this.now(), input.expiresInSeconds),
      };
    } catch {
      throw new ObjectStorageError("OBJECT_STORAGE_UNAVAILABLE");
    }
  }

  async authorizeDownload(input: {
    objectKey: string;
    downloadFileName: string;
    expiresInSeconds: number;
  }): Promise<DownloadAuthorization> {
    requireObjectKey(input.objectKey);
    requireAuthorizationTtl(input.expiresInSeconds);
    if (/\r|\n/u.test(input.downloadFileName) || input.downloadFileName.trim() === "") {
      throw new ObjectStorageError("INVALID_DOWNLOAD_FILE_NAME");
    }
    try {
      const url = await getSignedUrl(
        this.publicClient,
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: input.objectKey,
          ResponseContentDisposition: contentDisposition(input.downloadFileName.trim()),
        }),
        { expiresIn: input.expiresInSeconds },
      );
      return {
        method: "GET",
        url,
        expiresAt: expiresAt(this.now(), input.expiresInSeconds),
      };
    } catch {
      throw new ObjectStorageError("OBJECT_STORAGE_UNAVAILABLE");
    }
  }

  async statObject(objectKey: string): Promise<StoredObjectMetadata | null> {
    requireObjectKey(objectKey);
    try {
      const result = await this.client.send(new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
      }));
      return {
        objectKey,
        sizeBytes: result.ContentLength ?? 0,
        mediaType: result.ContentType ?? "application/octet-stream",
        etag: result.ETag?.replaceAll('"', "") ?? null,
        versionId: result.VersionId ?? null,
      };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw new ObjectStorageError("OBJECT_STORAGE_UNAVAILABLE");
    }
  }

  async readObjectBytes(objectKey: string, maxBytes: number): Promise<Uint8Array> {
    requireObjectKey(objectKey);
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new ObjectStorageError("OBJECT_STORAGE_UNAVAILABLE");
    }
    try {
      const result = await this.client.send(new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
      }));
      if (!result.Body || (result.ContentLength ?? maxBytes + 1) > maxBytes) {
        throw new ObjectStorageError("OBJECT_STORAGE_UNAVAILABLE");
      }
      const bytes = await result.Body.transformToByteArray();
      if (bytes.byteLength > maxBytes) throw new ObjectStorageError("OBJECT_STORAGE_UNAVAILABLE");
      return bytes;
    } catch (error) {
      if (error instanceof ObjectStorageError) throw error;
      throw new ObjectStorageError("OBJECT_STORAGE_UNAVAILABLE");
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    requireObjectKey(objectKey);
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
      }));
    } catch {
      throw new ObjectStorageError("OBJECT_STORAGE_UNAVAILABLE");
    }
  }
}

export function createStorageObjectKey(input: {
  projectId: string;
  assetId: string;
}): string {
  if (!UUID_PATTERN.test(input.projectId) || !UUID_PATTERN.test(input.assetId)) {
    throw new ObjectStorageError("INVALID_OBJECT_KEY");
  }
  return `projects/${input.projectId}/assets/${input.assetId}`;
}

function requireObjectKey(objectKey: string): void {
  const match = OBJECT_KEY_PATTERN.exec(objectKey);
  if (!match || !UUID_PATTERN.test(match[1] ?? "") || !UUID_PATTERN.test(match[2] ?? "")) {
    throw new ObjectStorageError("INVALID_OBJECT_KEY");
  }
}

function requireAuthorizationTtl(expiresInSeconds: number): void {
  if (
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds <= 0 ||
    expiresInSeconds > MAX_OBJECT_AUTHORIZATION_SECONDS
  ) {
    throw new ObjectStorageError("INVALID_AUTHORIZATION_TTL");
  }
}

function expiresAt(now: Date, expiresInSeconds: number): string {
  return new Date(now.getTime() + expiresInSeconds * 1000).toISOString();
}

function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replaceAll(/[^\x20-\x7e]/gu, "_").replaceAll(/["\\]/gu, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function isMissingObject(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const metadata = (error as Error & { $metadata?: { httpStatusCode?: number } }).$metadata;
  return error.name === "NotFound" || error.name === "NoSuchKey" || metadata?.httpStatusCode === 404;
}
