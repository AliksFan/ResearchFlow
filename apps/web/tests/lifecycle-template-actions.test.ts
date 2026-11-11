import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  publishDraft: vi.fn(),
}));
const redirect = vi.hoisted(() => vi.fn((href: string) => {
  throw new Error(`NEXT_REDIRECT:${href}`);
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/collaboration-session", () => ({
  requireCollaborationActor: vi.fn(async () => ({ personId: "virtual-pmo", roleCode: "PMO" })),
}));
vi.mock("@/server/progress-runtime", () => ({
  getLifecycleTemplateRuntime: vi.fn(() => ({ publishDraft: state.publishDraft })),
}));

import { publishLifecycleTemplateDraft } from "@/app/workspace/lifecycle-template-actions";

describe("lifecycle template publish action", () => {
  beforeEach(() => {
    state.publishDraft.mockReset();
    state.publishDraft.mockResolvedValue(undefined);
    redirect.mockClear();
  });

  it("redirects back to the just-published version", async () => {
    await expect(publishLifecycleTemplateDraft(publishForm()))
      .rejects.toThrow("NEXT_REDIRECT:/workspace/pmo/lifecycle-templates?templateSaved=published&selectedTemplateVersionId=version-published");
    expect(redirect).toHaveBeenLastCalledWith(
      "/workspace/pmo/lifecycle-templates?templateSaved=published&selectedTemplateVersionId=version-published",
    );
  });
});

function publishForm(): FormData {
  const form = new FormData();
  form.set("templateVersionId", "version-published");
  form.set("templateName", "虚构发布方案");
  form.set("expectedFingerprint", "fingerprint-1");
  return form;
}
