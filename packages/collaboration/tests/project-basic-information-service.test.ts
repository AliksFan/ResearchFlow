import { describe, expect, it, vi } from "vitest";
import { ProjectBasicInformationService, type ProjectBasicInformationChangeCommand, type ProjectBasicInformationRepository } from "../src/index.js";

const actor = { personId: "10000000-0000-4000-8000-000000000001", sessionId: "20000000-0000-4000-8000-000000000001", roleCode: "KEY_SUB_I" as const };
const command = (): ProjectBasicInformationChangeCommand => ({ commandId: "00000000-0000-4000-8000-000000000001", projectId: "30000000-0000-4000-8000-000000000001", projectName: "虚构项目", projectSummary: "虚构项目级简介", diseaseAreaOptionId: "40000000-0000-4000-8000-000000000001", diseaseAreaOptionCode: "OTHER", diseaseAreaOtherText: "虚构方向", researchTypeOptionId: "50000000-0000-4000-8000-000000000001", researchTypeOptionCode: "OBSERVATIONAL", researchTypeOtherText: null, leadOrganizationName: null, sponsorName: null, fundingRecordAmountCny: "100000.00", reason: "调整虚构项目资料" });
const repository = (): ProjectBasicInformationRepository => ({ getWorkspace: vi.fn(), submit: vi.fn(async () => ({ requestId: "request-1" })), decide: vi.fn(async () => undefined) });

describe("ProjectBasicInformationService", () => {
  it("allows only PMO and Key Sub-I to submit", async () => {
    const gateway = repository();
    await expect(new ProjectBasicInformationService(gateway).submit({ ...actor, roleCode: "DEAN" }, command())).rejects.toMatchObject({ code: "PROJECT_BASIC_INFORMATION_FORBIDDEN" });
    expect(gateway.submit).not.toHaveBeenCalled();
  });
  it("rejects invalid funding and patient-level content", async () => {
    const service = new ProjectBasicInformationService(repository());
    await expect(service.submit(actor, { ...command(), commandId: "invalid" })).rejects.toMatchObject({ code: "PROJECT_BASIC_INFORMATION_INVALID_INPUT" });
    await expect(service.submit(actor, { ...command(), fundingRecordAmountCny: "0" })).rejects.toMatchObject({ code: "PROJECT_BASIC_INFORMATION_INVALID_INPUT" });
    await expect(service.submit(actor, { ...command(), projectSummary: "包含患者姓名" })).rejects.toMatchObject({ code: "PROJECT_BASIC_INFORMATION_PATIENT_DATA_PROHIBITED" });
  });
  it("normalizes a valid command", async () => {
    const gateway = repository();
    await new ProjectBasicInformationService(gateway).submit(actor, { ...command(), projectName: "  虚构项目Ａ  ", reason: "  调整资料  " });
    expect(gateway.submit).toHaveBeenCalledWith(actor, expect.objectContaining({ projectName: "虚构项目A", reason: "调整资料" }));
  });
});
