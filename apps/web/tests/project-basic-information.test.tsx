import type { ProjectExecutionOverview } from "@researchflow/collaboration";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProjectBasicInformation } from "@/components/collaboration/project-basic-information";

const overview = {
  projectId: "project-1", projectCode: "DEMO-001", projectName: "虚构神经研究项目", projectStatus: "ACTIVE", swimlaneName: "虚构项目泳道", canEditSwimlane: true,
  basicInformation: { applicationCode: "APP-001", projectSummary: "虚构项目级简介", applicantDisplayName: "虚构申请人", primaryKeySubIDisplayName: "虚构主 Key Sub-I", otherKeySubIDisplayNames: ["虚构共同负责人"], leadOrganizationName: "虚构牵头单位", sponsorName: null, diseaseAreaDisplayName: "虚构疾病方向", researchTypeDisplayName: "虚构研究类型", plannedEndDate: "2027-03-31", fundingRecordAmountCny: "500000.00", establishedByDisplayName: "虚构 PMO", establishedAt: "2026-08-01T00:00:00.000Z", completedAt: null, archivedAt: null },
  stages: [],
} satisfies ProjectExecutionOverview;

describe("ProjectBasicInformation", () => {
  it("shows only the approved overview and keeps establishment details collapsed", () => {
    const html = renderToStaticMarkup(<ProjectBasicInformation overview={overview} recordedUsedAmount="100000.00" />);
    expect(html).toContain("虚构项目级简介");
    expect(html).toContain("虚构共同负责人");
    expect(html).toContain("已用 ¥100,000.00 / 未用 ¥400,000.00");
    expect(html).toContain("<details");
    expect(html).toContain("建档记录");
    expect(html).not.toContain("项目编号 / 申请编号");
    expect(html).not.toContain("当前阶段 / 关键节点");
    expect(html).not.toContain("合同与经费");
  });

  it("shows unavailable remaining and positive overage without a negative balance", () => {
    const missing = renderToStaticMarkup(<ProjectBasicInformation overview={{ ...overview, basicInformation: { ...overview.basicInformation, fundingRecordAmountCny: null } }} recordedUsedAmount="100.00" />);
    expect(missing).toContain("已用 ¥100.00 / 未用无法计算");
    const over = renderToStaticMarkup(<ProjectBasicInformation overview={overview} recordedUsedAmount="600000.00" />);
    expect(over).toContain("已用 ¥600,000.00 / 超出 ¥100,000.00");
    expect(over).not.toContain("-¥");
  });

  it("adds an idempotency key to each editable submission form", () => {
    const html = renderToStaticMarkup(<ProjectBasicInformation overview={overview} recordedUsedAmount="0.00" workspace={{ projectId: "project-1", projectStatus: "ACTIVE", canSubmit: true, values: { projectName: overview.projectName, projectSummary: overview.basicInformation.projectSummary, diseaseAreaOptionId: "disease-1", diseaseAreaOptionCode: "VIRTUAL", diseaseAreaOtherText: null, researchTypeOptionId: "research-1", researchTypeOptionCode: "VIRTUAL", researchTypeOtherText: null, leadOrganizationName: null, sponsorName: null, fundingRecordAmountCny: null }, dictionaryOptions: { diseaseAreas: [{ id: "disease-1", code: "VIRTUAL", label: "虚构方向" }], researchTypes: [{ id: "research-1", code: "VIRTUAL", label: "虚构类型" }] }, activeRequest: null, history: [] }} editOpen submitAction={async () => undefined} />);
    expect(html).toMatch(/name="commandId" value="[0-9a-f-]{36}"/u);
  });
});
