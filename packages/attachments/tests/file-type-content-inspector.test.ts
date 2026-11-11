import { describe, expect, it, vi } from "vitest";

import {
  FileTypeAttachmentContentInspector,
  MAX_ATTACHMENT_FILE_BYTES,
  type PrivateObjectStorage,
} from "../src/index.js";

const samples = [
  ["application/pdf", new TextEncoder().encode("%PDF-1.7\n%virtual")],
  ["image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43])],
  ["image/png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    Buffer.from("UEsDBBQAAAAIAFJjGF1M12HDYQAAAGkAAAARAAAAd29yZC9kb2N1bWVudC54bWxEzMENgCAMAMBVjANY48MHQXZBQCChLaEYdHuf3gCnh/LsbgzUpwcLiRrHnHqvCkBcCmhl4RrowXJxQ9tl4RZhcPO1sQsimSIW2NZ1B7SZZqOHOtm/YDT8ufkAAAD//wMAUEsDBBQAAAAIAFJjGF2sbhJapAAAANwAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFyPMQ7CMAxFr1JlRdSIgQG1XdiBgQtYqdtGxHaUGCi3RwWpA/PXe0+/ub0TlWrmKKV1k1k6AhQ/EWOpNZHMHAfNjFZqzSMk9HccCfa73QG8ipHY1haH65rLk3IOPVVXzHZGptbBS3MPvfoHk1g9c3TV6Yct5dZhSjF4tKACT+n/mlsdhuBp5RdbyuqplCAjx3pdGINsFj10DXxPdR8AAAD//wMAUEsBAhQAFAAAAAgAUmMYXUzXYcNhAAAAaQAAABEAAAAAAAAAAAAAAAAAAAAAAHdvcmQvZG9jdW1lbnQueG1sUEsBAhQAFAAAAAgAUmMYXaxuElqkAAAA3AAAABMAAAAAAAAAAAAAAAAAkAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwUGAAAAAAIAAgCAAAAAZQEAAAAA", "base64"),
  ],
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    Buffer.from("UEsDBBQAAAAIAFJjGF1bepU8UQAAAE0AAAAPAAAAeGwvd29ya2Jvb2sueG1sBMHBDYAgDADAVQwDUOLDh1F3qVrFQClpm+j43i2vaNlFyvBxbbaG7N5nADsyMVqUTu3jeokyukXRG6wr4WmZyLnCmNIEjE8LsP0AAAD//wMAUEsDBBQAAAAIAFJjGF2U7PTVpgAAANQAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFyPMQ7CMAxFr1JlRcQVAwNqu7ADAxcwqdtGjeMoMaXcHhU2pj+99/Sb+ztRqVYOsbRmUk0ngOImYixWEsWVwyCZUYuVPEJCN+NIcKjrIziJSlH3ujlM11wXytn3VN0w6wWZWgNrgJfk+SEy25WDqc4/aOu2BlMK3qF6ibDE/q+4l2HwjnpxT6aotqRM2JeJSDnY71pGH3ebGLoGvme6DwAAAP//AwBQSwECFAAUAAAACABSYxhdW3qVPFEAAABNAAAADwAAAAAAAAAAAAAAAAAAAAAAeGwvd29ya2Jvb2sueG1sUEsBAhQAFAAAAAgAUmMYXZTs9NWmAAAA1AAAABMAAAAAAAAAAAAAAAAAfgAAAFtDb250ZW50X1R5cGVzXS54bWxQSwUGAAAAAAIAAgB+AAAAVQEAAAAA", "base64"),
  ],
] as const;

describe("FileTypeAttachmentContentInspector", () => {
  it.each(samples)("detects %s from stored bytes", async (mediaType, bytes) => {
    const storage = {
      readObjectBytes: vi.fn(async () => new Uint8Array(bytes)),
    } as unknown as PrivateObjectStorage;
    await expect(new FileTypeAttachmentContentInspector(storage).inspectObject("opaque-key"))
      .resolves.toMatchObject({ mediaType, sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) });
    expect(storage.readObjectBytes).toHaveBeenCalledWith("opaque-key", MAX_ATTACHMENT_FILE_BYTES);
  });
});
