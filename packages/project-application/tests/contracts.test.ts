import { describe, expect, it } from "vitest";

import {
  projectApplicationCommandSchema,
  projectApplicationErrorCodeSchema,
} from "../src/index.js";

describe("project application command contract", () => {
  it("requires actor, optimistic version, command id, and application identity", () => {
    expect(projectApplicationCommandSchema.safeParse({
      actor: { personId: "person-1", roleCode: "KEY_SUB_I", sessionId: "session-1" },
      projectId: "project-1",
      expectedRowVersion: 2,
      applicationVersionId: "version-2",
      reviewId: null,
      commandId: "command-1",
    }).success).toBe(true);

    expect(projectApplicationCommandSchema.safeParse({
      projectId: "project-1",
      expectedRowVersion: -1,
    }).success).toBe(false);
  });

  it("freezes the approved error-code vocabulary", () => {
    expect(projectApplicationErrorCodeSchema.parse("PROJECT_APPLICATION_CONFLICT"))
      .toBe("PROJECT_APPLICATION_CONFLICT");
    expect(projectApplicationErrorCodeSchema.safeParse("UNAPPROVED_ERROR").success)
      .toBe(false);
  });
});
