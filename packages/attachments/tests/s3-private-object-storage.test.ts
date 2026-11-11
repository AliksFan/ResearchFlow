import {
  CreateBucketCommand,
  DeleteBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createStorageObjectKey,
  ObjectStorageError,
  S3PrivateObjectStorage,
} from "../src/index.js";

const enabled = process.env.RF_ATTACHMENT_S3_TEST === "1";

describe("S3 private object storage input validation", () => {
  const storage = new S3PrivateObjectStorage({
    endpoint: "http://127.0.0.1:1",
    region: "us-east-1",
    bucket: "disabled",
    accessKeyId: "disabled",
    secretAccessKey: "disabled",
  });

  it("rejects an object key whose identifiers are not valid UUIDs", async () => {
    await expect(storage.authorizeUpload({
      objectKey: "projects/------------------------------------/assets/------------------------------------",
      mediaType: "application/pdf",
      expiresInSeconds: 60,
    })).rejects.toEqual(new ObjectStorageError("INVALID_OBJECT_KEY"));
  });

  it("rejects authorization beyond the 30 minute limit", async () => {
    await expect(storage.authorizeUpload({
      objectKey: createStorageObjectKey({
        projectId: "e3000000-0000-4000-8000-000000000001",
        assetId: "f3000000-0000-4000-8000-000000000001",
      }),
      mediaType: "application/pdf",
      expiresInSeconds: 1801,
    })).rejects.toEqual(new ObjectStorageError("INVALID_AUTHORIZATION_TTL"));
  });

  it("rejects response-header injection in a download file name", async () => {
    await expect(storage.authorizeDownload({
      objectKey: createStorageObjectKey({
        projectId: "e3000000-0000-4000-8000-000000000001",
        assetId: "f3000000-0000-4000-8000-000000000001",
      }),
      downloadFileName: "project.pdf\r\nX-Test: injected",
      expiresInSeconds: 60,
    })).rejects.toEqual(new ObjectStorageError("INVALID_DOWNLOAD_FILE_NAME"));
  });

  it("uses the public endpoint only for browser-facing authorization URLs", async () => {
    const publicStorage = new S3PrivateObjectStorage({
      endpoint: "http://minio:9000",
      publicEndpoint: "https://storage.example.invalid:9443",
      region: "us-east-1",
      bucket: "researchflow-attachments-prod",
      accessKeyId: "virtual-access-key",
      secretAccessKey: "virtual-secret-key-at-least-32-bytes",
    });
    const upload = await publicStorage.authorizeUpload({
      objectKey: createStorageObjectKey({
        projectId: "e3000000-0000-4000-8000-000000000001",
        assetId: "f3000000-0000-4000-8000-000000000001",
      }),
      mediaType: "application/pdf",
      expiresInSeconds: 60,
    });
    expect(new URL(upload.url).origin).toBe("https://storage.example.invalid:9443");
  });
});

describe.runIf(enabled)("S3 private object storage", () => {
  const config = {
    endpoint: requiredEnvironment("RF_ATTACHMENT_S3_ENDPOINT"),
    region: "us-east-1",
    bucket: requiredEnvironment("RF_ATTACHMENT_S3_BUCKET"),
    accessKeyId: requiredEnvironment("RF_ATTACHMENT_S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironment("RF_ATTACHMENT_S3_SECRET_ACCESS_KEY"),
  };
  const client = new S3Client({
    ...config,
    credentials: config,
    forcePathStyle: true,
  });
  const storage = new S3PrivateObjectStorage(config);
  const objectKey = createStorageObjectKey({
    projectId: "e3000000-0000-4000-8000-000000000001",
    assetId: "f3000000-0000-4000-8000-000000000001",
  });

  beforeAll(async () => {
    try {
      await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (!(name === "BucketAlreadyOwnedByYou" || name === "BucketAlreadyExists")) throw error;
    }
  });

  afterAll(async () => {
    await storage.deleteObject(objectKey);
    await client.send(new DeleteBucketCommand({ Bucket: config.bucket }));
    client.destroy();
  });

  it("uses a private opaque object key and supports authorized upload and download", async () => {
    expect(objectKey).toBe(
      "projects/e3000000-0000-4000-8000-000000000001/assets/f3000000-0000-4000-8000-000000000001",
    );
    expect(objectKey).not.toContain("进展");

    const upload = await storage.authorizeUpload({
      objectKey,
      mediaType: "application/pdf",
      expiresInSeconds: 300,
    });
    const body = new TextEncoder().encode("virtual project attachment");
    const uploadResponse = await fetch(upload.url, {
      method: upload.method,
      headers: upload.requiredHeaders,
      body,
    });
    expect(uploadResponse.status).toBe(200);

    await expect(storage.statObject(objectKey)).resolves.toMatchObject({
      objectKey,
      sizeBytes: body.byteLength,
      mediaType: "application/pdf",
    });
    await expect(storage.readObjectBytes(objectKey, 1024)).resolves.toEqual(body);
    const anonymousResponse = await fetch(`${config.endpoint}/${config.bucket}/${objectKey}`);
    expect(anonymousResponse.status).toBe(403);

    const download = await storage.authorizeDownload({
      objectKey,
      downloadFileName: "虚拟项目进展.pdf",
      expiresInSeconds: 60,
    });
    const downloadResponse = await fetch(download.url);
    expect(downloadResponse.status).toBe(200);
    expect(new Uint8Array(await downloadResponse.arrayBuffer())).toEqual(body);
  });

  it("returns null without leaking details when an object is missing", async () => {
    const missingObjectKey = createStorageObjectKey({
      projectId: "e3000000-0000-4000-8000-000000000001",
      assetId: "f3000000-0000-4000-8000-000000000002",
    });
    await expect(storage.statObject(missingObjectKey)).resolves.toBeNull();
  });
});

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value && enabled) throw new Error(`${name}_REQUIRED`);
  return value ?? "disabled";
}
