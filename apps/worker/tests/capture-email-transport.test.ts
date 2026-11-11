import { describe, expect, it } from "vitest";

import { CaptureEmailTransport } from "../src/capture-email-transport.js";

describe("CaptureEmailTransport", () => {
  it("captures a test delivery without contacting an external service", async () => {
    const transport = new CaptureEmailTransport();
    const message = { to: "pmo@example.invalid", subject: "虚拟项目提醒", text: "仅含项目级摘要", actionUrl: "https://localhost/workspace/projects/test/execution", idempotencyKey: "event-1" };
    const first = await transport.send(message);
    await expect(transport.send(message)).resolves.toEqual(first);
    expect(transport.captured()).toEqual([message]);
  });
});
