import { describe, expect, it, vi } from "vitest";

import { DictionaryService, type DictionaryRepository } from "../src/index.js";

const repository = {
  listWorkspace: vi.fn(),
  saveOptions: vi.fn(),
  createOption: vi.fn(),
  deleteOption: vi.fn(),
  reviewSuggestion: vi.fn(),
} satisfies DictionaryRepository;
const service = new DictionaryService(repository);
const pmo = { personId: "person-pmo", sessionId: "session-pmo", roleCode: "PMO" as const };

describe("DictionaryService", () => {
  it("rejects non-PMO configuration writes", () => {
    expect(() => service.createOption(
      { ...pmo, roleCode: "KEY_SUB_I" },
      "DISEASE_AREA",
      "虚构方向",
    )).toThrowError(expect.objectContaining({ code: "COLLABORATION_FORBIDDEN" }));
  });

  it("normalizes a new formal option before delegating", async () => {
    repository.createOption.mockResolvedValueOnce(undefined);
    await service.createOption(pmo, "DISEASE_AREA", "  虚构方向  ");
    expect(repository.createOption).toHaveBeenCalledWith(pmo, "DISEASE_AREA", "虚构方向");
  });

  it("requires a target for merge and an internal comment for rejection", () => {
    expect(() => service.reviewSuggestion(pmo, "ISSUE_TYPE", "suggestion-1", 0, {
      action: "MERGE",
      targetOptionId: " ",
    })).toThrowError(expect.objectContaining({ code: "DICTIONARY_INVALID_INPUT" }));
    expect(() => service.reviewSuggestion(pmo, "ISSUE_TYPE", "suggestion-1", 0, {
      action: "REJECT",
      comment: " ",
    })).toThrowError(expect.objectContaining({ code: "DICTIONARY_INVALID_INPUT" }));
  });

  it("validates and delegates option deletion with optimistic concurrency", async () => {
    repository.deleteOption.mockResolvedValueOnce(undefined);
    await service.deleteOption(pmo, "RESEARCH_TYPE", "option-1", "2026-09-08T05:00:00.000Z");
    expect(repository.deleteOption).toHaveBeenCalledWith(
      pmo,
      "RESEARCH_TYPE",
      "option-1",
      "2026-09-08T05:00:00.000Z",
    );
    expect(() => service.deleteOption(
      { ...pmo, roleCode: "KEY_SUB_I" },
      "RESEARCH_TYPE",
      "option-1",
      "2026-09-08T05:00:00.000Z",
    )).toThrowError(expect.objectContaining({ code: "COLLABORATION_FORBIDDEN" }));
    expect(() => service.deleteOption(pmo, "RESEARCH_TYPE", " ", "stale"))
      .toThrowError(expect.objectContaining({ code: "DICTIONARY_INVALID_INPUT" }));
  });

  it("keeps ordinary sort orders before the reserved OTHER position", () => {
    expect(() => service.saveOptions(pmo, "DISEASE_AREA", [{
      id: "option-1",
      displayName: "虚构方向",
      sortOrder: 9999,
      enabled: true,
      expectedUpdatedAt: "2026-09-08T05:00:00.000Z",
    }])).toThrowError(expect.objectContaining({ code: "DICTIONARY_INVALID_INPUT" }));
  });
});
